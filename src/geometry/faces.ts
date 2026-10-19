import type { FaceKey, Project, Side, Vec2 } from '../model/types.ts';
import { EXT_WALL, PARAPET, SLAB } from '../model/units.ts';
import { roomRect, union, type Rect } from './rect.ts';
import { Region, loopEdges } from './region.ts';

export const SIDES: Side[] = ['front', 'right', 'rear', 'left'];

const NORMAL: Record<Side, Vec2> = { front: [0, -1], rear: [0, 1], left: [-1, 0], right: [1, 0] };

export function bearingOf(side: Side, northAngle: number): number {
  const t = (northAngle * Math.PI) / 180;
  const n: Vec2 = [Math.sin(t), Math.cos(t)];
  const e: Vec2 = [Math.cos(t), -Math.sin(t)];
  const v = NORMAL[side];
  const b = (Math.atan2(v[0] * e[0] + v[1] * e[1], v[0] * n[0] + v[1] * n[1]) * 180) / Math.PI;
  return (b + 360) % 360;
}

export function faceKeyOf(side: Side, northAngle: number): FaceKey {
  return (['N', 'E', 'S', 'W'] as FaceKey[])[Math.round(bearingOf(side, northAngle) / 90) % 4];
}

export const FACE_NAME: Record<FaceKey, string> = { N: 'NORTH', S: 'SOUTH', E: 'EAST', W: 'WEST' };

export interface FaceLevel { index: number; ffl: number; slabBottom: number }

export interface FaceOpening {
  id: string;
  tag: string;
  kind: string;
  u0: number; u1: number; z0: number; z1: number;
  levelIndex: number;
  /** ventilation a screen in front must pass, as a fraction of the opening area */
  reqRatio: number;
  door: boolean;
  roomName: string;
  /** how far this opening's wall sits behind the face plane (m) */
  inset?: number;
}

/**
 * A stretch of one face where the wall is a single plane: consecutive storeys that share
 * extent and set-back. Facades are generated per zone so the skin follows the massing.
 */
export interface FaceZone {
  u0: number; u1: number;
  /** clad height: bottom (plinth top or soffit) to top (next soffit, terrace edge or parapet) */
  z0: number; z1: number;
  /** wall plane behind the face plane, m (≥ 0) */
  inset: number;
  levels: number[];
  roof: boolean;
  /** how far this zone projects past the storey below (a cantilever soffit), m; 0 if it does not */
  overhang: number;
  /** the top edge is open: the roof of this zone is a terrace deck */
  deck: boolean;
}

export interface Face {
  side: Side;
  key: FaceKey;
  bearing: number;
  /** outer face length, metres */
  width: number;
  /** plan frame: point = O + u·U + d·N  (d = distance outward from the outer wall face) */
  O: Vec2; U: Vec2; N: Vec2;
  groundZ: number;
  plinthTop: number;
  levels: FaceLevel[];
  roofZ: number;
  parapetTop: number;
  gridU: { u: number; label: string }[];
  openings: FaceOpening[];
  zones: FaceZone[];
  /** stair head-room enclosure above roof, in face coords; dist = set-back from this face */
  mumty: { u0: number; u1: number; z0: number; z1: number; dist: number } | null;
}

export const footprint = (p: Project): Rect => union(p.levels.flatMap((l) => l.rooms.map(roomRect)));

export function outerRect(fp: Rect): Rect {
  const h = EXT_WALL / 2;
  return { x0: fp.x0 - h, y0: fp.y0 - h, x1: fp.x1 + h, y1: fp.y1 + h };
}

export function faceFrame(side: Side, o: Rect): { O: Vec2; U: Vec2; N: Vec2; width: number } {
  switch (side) {
    case 'front': return { O: [o.x0, o.y0], U: [1, 0], N: [0, -1], width: o.x1 - o.x0 };
    case 'rear': return { O: [o.x1, o.y1], U: [-1, 0], N: [0, 1], width: o.x1 - o.x0 };
    case 'left': return { O: [o.x0, o.y1], U: [0, -1], N: [-1, 0], width: o.y1 - o.y0 };
    case 'right': return { O: [o.x1, o.y0], U: [0, 1], N: [1, 0], width: o.y1 - o.y0 };
  }
}

export const toPlan = (f: Pick<Face, 'O' | 'U' | 'N'>, u: number, d: number): Vec2 =>
  [f.O[0] + u * f.U[0] + d * f.N[0], f.O[1] + u * f.U[1] + d * f.N[1]];

/** project a plan point to the face u coordinate */
export const toU = (f: Pick<Face, 'O' | 'U'>, x: number, y: number) => (x - f.O[0]) * f.U[0] + (y - f.O[1]) * f.U[1];
export const toD = (f: Pick<Face, 'O' | 'N'>, x: number, y: number) => (x - f.O[0]) * f.N[0] + (y - f.O[1]) * f.N[1];

export function gridLines(p: Project) {
  const xs: number[] = [p.grid.origin[0]];
  for (const b of p.grid.xBays) xs.push(xs[xs.length - 1] + b);
  const ys: number[] = [p.grid.origin[1]];
  for (const b of p.grid.yBays) ys.push(ys[ys.length - 1] + b);
  return {
    xs: xs.map((x, i) => ({ v: x, label: String(i + 1) })),
    ys: ys.map((y, i) => ({ v: y, label: String.fromCharCode(65 + i) })),
  };
}

export function roofZ(p: Project) {
  return p.brief.plinth + p.levels.length * p.brief.floorToFloor;
}

export function buildFaceShell(p: Project, side: Side): Omit<Face, 'openings'> {
  const fp = footprint(p);
  const o = outerRect(fp);
  const fr = faceFrame(side, o);
  const zones = faceZones(p, side, fr, o);
  const levels = p.levels.map((l) => ({ index: l.index, ffl: l.elevation, slabBottom: l.elevation - SLAB }));
  const rz = roofZ(p);
  const g = gridLines(p);
  const lines = side === 'front' || side === 'rear' ? g.xs.map((l) => ({ u: toU(fr, l.v, 0), label: l.label }))
    : g.ys.map((l) => ({ u: toU(fr, 0, l.v), label: l.label }));
  const sp = p.stair.position;
  const sr: Rect = { x0: sp.x - EXT_WALL / 2, y0: sp.y - EXT_WALL / 2, x1: sp.x + sp.w + EXT_WALL / 2, y1: sp.y + sp.h + EXT_WALL / 2 };
  const us = [toU(fr, sr.x0, sr.y0), toU(fr, sr.x1, sr.y1)];
  const ds = [toD(fr, sr.x0, sr.y0), toD(fr, sr.x1, sr.y1), toD(fr, sr.x0, sr.y1), toD(fr, sr.x1, sr.y0)];
  return {
    side, key: faceKeyOf(side, p.site.northAngle), bearing: bearingOf(side, p.site.northAngle),
    width: fr.width, O: fr.O, U: fr.U, N: fr.N, groundZ: 0, plinthTop: p.brief.plinth, levels,
    roofZ: rz, parapetTop: rz + PARAPET, gridU: lines.sort((a, b) => a.u - b.u), zones,
    mumty: { u0: Math.min(...us), u1: Math.max(...us), z0: rz, z1: rz + 2.7 + SLAB, dist: -Math.max(...ds) },
  };
}

const OUT: Record<Side, Vec2> = NORMAL;

/**
 * Wall planes of every storey on this face, from the storeys' true outlines. Each outline edge
 * facing this side is one plane; edges are split at every break any storey makes along the face,
 * pieces repeating storey after storey are stacked into one zone, and neighbours with identical
 * build-up are merged back.
 */
function faceZones(p: Project, side: Side, fr: { O: Vec2; U: Vec2; N: Vec2 }, o: Rect): FaceZone[] {
  const rz = roofZ(p);
  const n = p.levels.length;
  const regions = p.levels.map((l) => Region.of(l.rooms.map(roomRect)).inflate(EXT_WALL / 2));
  const nrm = OUT[side];
  const insetOf = (pt: Vec2) => side === 'front' ? pt[1] - o.y0 : side === 'rear' ? o.y1 - pt[1] : side === 'left' ? pt[0] - o.x0 : o.x1 - pt[0];
  type Seg = { u0: number; u1: number; inset: number };
  const segs: Seg[][] = regions.map((rg) => rg.loops().flatMap((lp) => loopEdges(lp)
    .filter((e) => e.n[0] === nrm[0] && e.n[1] === nrm[1])
    .map((e) => {
      const ua = toU(fr, e.a[0], e.a[1]), ub = toU(fr, e.b[0], e.b[1]);
      return { u0: Math.min(ua, ub), u1: Math.max(ua, ub), inset: Math.max(0, insetOf(e.a)) };
    })));
  const cuts = [...new Set(segs.flat().flatMap((g) => [g.u0, g.u1]).map((u) => Math.round(u * 1e4) / 1e4))].sort((a, b) => a - b);
  // plan point at face position u, set back by d from the face plane
  const at = (u: number, d: number): Vec2 => [fr.O[0] + u * fr.U[0] - d * fr.N[0], fr.O[1] + u * fr.U[1] - d * fr.N[1]];
  const pieces: (Seg & { level: number })[] = [];
  segs.forEach((ls, level) => {
    for (const g of ls) {
      const cs = [g.u0, ...cuts.filter((c) => c > g.u0 + 1e-3 && c < g.u1 - 1e-3), g.u1];
      for (let k = 0; k < cs.length - 1; k++) pieces.push({ u0: cs[k], u1: cs[k + 1], inset: g.inset, level });
    }
  });
  const ffl = (i: number) => p.levels[i].elevation;
  // stack identical pieces on consecutive storeys
  const stacks: { u0: number; u1: number; inset: number; lv: number[] }[] = [];
  for (const pc of pieces.sort((a, b) => a.level - b.level)) {
    const s = stacks.find((q) => Math.abs(q.u0 - pc.u0) + Math.abs(q.u1 - pc.u1) + Math.abs(q.inset - pc.inset) < 1e-3 && q.lv[q.lv.length - 1] === pc.level - 1);
    if (s) s.lv.push(pc.level); else stacks.push({ u0: pc.u0, u1: pc.u1, inset: pc.inset, lv: [pc.level] });
  }
  const zones: FaceZone[] = stacks.map((s) => {
    const a = s.lv[0], b = s.lv[s.lv.length - 1], um = (s.u0 + s.u1) / 2;
    const inside = at(um, s.inset + 0.02), outside = at(um, s.inset - 0.02);
    // bottom: on the plinth, or at a soffit where it overhangs the storey below
    let z0 = p.brief.plinth, overhang = 0;
    if (a > 0) {
      const lo = regions[a - 1];
      z0 = lo.contains(...inside) && lo.contains(...outside) ? ffl(a) : ffl(a) - SLAB;
      if (!lo.contains(...inside)) {
        for (let dd = 0.1; dd < 6; dd += 0.1) if (lo.contains(...at(um, s.inset + dd))) { overhang = dd; break; }
        if (!overhang) overhang = 1.5;
      }
    }
    // top: under the storey above, or an open edge (deck) / the main roof
    let z1 = rz + PARAPET, roof = true, deck = false;
    if (b < n - 1) {
      roof = false;
      const up = regions[b + 1];
      z1 = up.contains(...inside) ? ffl(b + 1) - SLAB : ffl(b + 1);
      deck = !up.contains(...inside);
    }
    return { u0: s.u0, u1: s.u1, z0, z1, inset: s.inset, levels: s.lv, roof, overhang, deck };
  });
  // merge side-by-side zones with the same build-up
  zones.sort((a, b) => a.levels[0] - b.levels[0] || a.u0 - b.u0);
  const merged: FaceZone[] = [];
  for (const z of zones) {
    const m = merged.find((q) => Math.abs(q.u1 - z.u0) < 1e-3 && Math.abs(q.inset - z.inset) < 1e-3 && Math.abs(q.z0 - z.z0) < 1e-3 && Math.abs(q.z1 - z.z1) < 1e-3
      && q.levels.join() === z.levels.join() && q.roof === z.roof && q.deck === z.deck && (q.overhang > 0) === (z.overhang > 0));
    if (m) { m.u1 = z.u1; m.overhang = Math.min(m.overhang, z.overhang); } else merged.push({ ...z });
  }
  return merged;
}
