import type { FaceKey, Project, Side, Vec2 } from '../model/types.ts';
import { EXT_WALL, PARAPET, SLAB } from '../model/units.ts';
import { roomRect, union, type Rect } from './rect.ts';

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
    roofZ: rz, parapetTop: rz + PARAPET, gridU: lines.sort((a, b) => a.u - b.u),
    mumty: { u0: Math.min(...us), u1: Math.max(...us), z0: rz, z1: rz + 2.7 + SLAB, dist: -Math.max(...ds) },
  };
}
