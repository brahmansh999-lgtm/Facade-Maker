// Elevation of one face: wall, plinth, slab bands, parapet, openings with frames and cills,
// the facade layer, stair head-room beyond, grid, chain dims, level datums.
import type { Derived } from '../model/derive.ts';
import type { Side } from '../model/types.ts';
import type { Face } from '../geometry/faces.ts';
import { FACE_NAME } from '../geometry/faces.ts';
import type { Prim } from '../facades/types.ts';
import { levelText } from '../model/units.ts';
import { BAND } from '../facades/kit.ts';
import { drawPrims } from './primDraw.ts';
import { View, W, type Painter } from './painter.ts';
import { ACCENT, GLASS, INK, shade } from './color.ts';
import { bubble, chainDim, earthHatch, levelMark } from './annot.ts';

export const WALL_TONE = '#e6e6e3';
const DOOR_TONE = '#b59572';

export interface ElevOpts {
  prims?: Prim[];
  dims?: boolean;
  datums?: boolean;
  grid?: boolean;
  tags?: boolean;
  flagged?: Set<string>;
  simple?: boolean;
}

/** extents in model metres the elevation needs around the face (for layout) */
export function elevExtents(face: Face) {
  return { w: face.width + 7.5, h: Math.max(face.parapetTop, face.mumty?.z1 ?? 0) + 4.2 };
}

export function elevationTitle(d: Derived, side: Side) {
  const f = d.faces[side].face;
  return `${FACE_NAME[f.key]} ELEVATION (${side.toUpperCase()})`;
}

export function drawElevation(pt: Painter, d: Derived, side: Side, v: View, o: ElevOpts = {}) {
  const fd = d.faces[side];
  const f = fd.face;
  const prims = o.prims ?? fd.out.prims;
  const X = v.X, Y = v.Y, k = v.k;
  const R = (u0: number, z0: number, u1: number, z1: number, s: Parameters<Painter['rect']>[4]) =>
    pt.rect(X(Math.min(u0, u1)), Y(Math.max(z0, z1)), Math.abs(u1 - u0) * k, Math.abs(z1 - z0) * k, s);
  const lineW = o.simple ? 0.18 : W.OUTLINE;

  // ground
  pt.line(X(-2.2), Y(0), X(f.width + 2.2), Y(0), { stroke: INK, sw: W.CUT * 1.2 });
  if (!o.simple) earthHatch(pt, X(-2.2), X(f.width + 2.2), Y(0), 1.4);

  // stair head-room beyond the parapet
  if (f.mumty) {
    const m = f.mumty;
    R(m.u0, m.z0, m.u1, m.z1, { fill: shade(WALL_TONE, 0.06), stroke: INK, sw: W.BEYOND });
    R(m.u0 - 0.05, m.z1 - 0.15, m.u1 + 0.05, m.z1, { fill: shade(WALL_TONE, 0.1), stroke: INK, sw: W.BEYOND });
  }
  // wall per massing zone (set-back zones a touch darker), plinth, slab bands, parapet coping
  const zones = f.zones.length ? f.zones : [{ u0: 0, u1: f.width, z0: f.plinthTop, z1: f.parapetTop, inset: 0, levels: f.levels.map((l) => l.index), roof: true }];
  const z0w = zones[0];
  for (const z of zones) {
    R(z.u0, z.z0, z.u1, z.z1, { fill: z.inset > 1e-3 ? shade(WALL_TONE, -0.05) : WALL_TONE });
    for (const li of z.levels) {
      const l = f.levels.find((q) => q.index === li);
      if (!l || l.ffl - BAND <= z.z0 + 1e-3) continue;
      pt.line(X(z.u0), Y(l.ffl - BAND), X(z.u1), Y(l.ffl - BAND), { stroke: INK, sw: W.BEYOND });
      pt.line(X(z.u0), Y(l.ffl), X(z.u1), Y(l.ffl), { stroke: INK, sw: W.BEYOND });
    }
    if (z.roof) {
      pt.line(X(z.u0), Y(f.roofZ - BAND), X(z.u1), Y(f.roofZ - BAND), { stroke: INK, sw: W.BEYOND });
      pt.line(X(z.u0), Y(f.roofZ), X(z.u1), Y(f.roofZ), { stroke: INK, sw: W.BEYOND });
      R(z.u0 - 0.03, f.parapetTop - 0.075, z.u1 + 0.03, f.parapetTop, { fill: shade(WALL_TONE, 0.1), stroke: INK, sw: W.BEYOND });
    } else {
      // slab edge at the step
      pt.line(X(z.u0), Y(z.z1), X(z.u1), Y(z.z1), { stroke: INK, sw: W.PROJ });
    }
  }
  R(z0w.u0, 0, z0w.u1, f.plinthTop, { fill: shade(WALL_TONE, 0.16), stroke: INK, sw: W.PROJ });

  // openings
  for (const op of f.openings) {
    const h = op.z1 - op.z0, w = op.u1 - op.u0;
    if (op.door) {
      R(op.u0, op.z0, op.u1, op.z1, { fill: op.kind === 'garden' ? GLASS : DOOR_TONE, stroke: INK, sw: W.PROJ });
      R(op.u0 + 0.05, op.z0, op.u1 - 0.05, op.z1 - 0.05, { stroke: INK, sw: W.THIN });
      const leaves = w >= 1.1 ? 2 : 1;
      for (let i = 1; i < leaves; i++) pt.line(X(op.u0 + (w * i) / leaves), Y(op.z0), X(op.u0 + (w * i) / leaves), Y(op.z1 - 0.05), { stroke: INK, sw: W.THIN });
    } else {
      R(op.u0, op.z0, op.u1, op.z1, { fill: GLASS, stroke: INK, sw: W.PROJ });
      R(op.u0 + 0.05, op.z0 + 0.05, op.u1 - 0.05, op.z1 - 0.05, { stroke: INK, sw: W.THIN });
      const leaves = Math.max(1, Math.ceil(w / 0.75 - 1e-6));
      for (let i = 1; i < leaves; i++) pt.line(X(op.u0 + (w * i) / leaves), Y(op.z0 + 0.05), X(op.u0 + (w * i) / leaves), Y(op.z1 - 0.05), { stroke: INK, sw: W.THIN });
      if (h > 1.7) pt.line(X(op.u0 + 0.05), Y(op.z1 - 0.5), X(op.u1 - 0.05), Y(op.z1 - 0.5), { stroke: INK, sw: W.THIN });
      // see-through glass: the room's soffit shadow behind, two soft reflections across the pane
      if (!o.simple) {
        R(op.u0 + 0.05, op.z1 - Math.min(0.35, h * 0.25), op.u1 - 0.05, op.z1 - 0.05, { fill: shade(GLASS, -0.18), opacity: 0.55 });
        pt.line(X(op.u0 + w * 0.15), Y(op.z0 + h * 0.2), X(op.u0 + w * 0.42), Y(op.z0 + h * 0.8), { stroke: '#ffffff', sw: 0.35, opacity: 0.8 });
        pt.line(X(op.u0 + w * 0.3), Y(op.z0 + h * 0.2), X(op.u0 + w * 0.45), Y(op.z0 + h * 0.52), { stroke: '#ffffff', sw: 0.2, opacity: 0.7 });
      }
      // cill
      R(op.u0 - 0.05, op.z0 - 0.04, op.u1 + 0.05, op.z0, { fill: shade(WALL_TONE, 0.12), stroke: INK, sw: W.BEYOND });
    }
  }

  // facade layer
  pt.begin('facade');
  drawPrims(pt, prims, { X, Y, k }, { line: o.simple ? 0.1 : W.BEYOND, detail: o.simple ? 0 : 1 });
  pt.end();

  // massing: shadow under each cantilever, glass to terraces, the floating roof lid
  for (let k = 1; k < zones.length; k++) {
    const lo = zones[k - 1], up = zones[k];
    if (up.inset < lo.inset - 1e-3 || up.u0 < lo.u0 - 1e-3 || up.u1 > lo.u1 + 1e-3) {
      const depth = Math.max(0.2, Math.min(0.7, (lo.inset - up.inset) * 0.45 || 0.35));
      R(Math.max(lo.u0, up.u0), up.z0 - depth, Math.min(lo.u1, up.u1), up.z0, { fill: INK, opacity: 0.13 });
      pt.line(X(up.u0), Y(up.z0), X(up.u1), Y(up.z0), { stroke: INK, sw: W.PROJ });
    } else {
      const zt = lo.z1, runs: [number, number][] = up.inset > lo.inset + 1e-3 ? [[lo.u0, lo.u1]] : [[lo.u0, up.u0], [up.u1, lo.u1]];
      for (const [a, b] of runs) {
        if (b - a < 0.05) continue;
        R(a, zt, b, zt + 1.0, { fill: GLASS, opacity: 0.55, stroke: INK, sw: W.BEYOND });
        R(a, zt + 0.95, b, zt + 1.0, { fill: shade(INK, -0.2), stroke: INK, sw: W.THIN });
      }
    }
  }
  const lid = d.project.massing?.lid ?? 0;
  const zr = zones[zones.length - 1];
  if (lid > 0) {
    const zt = f.parapetTop + 0.12;
    for (const u of [zr.u0 + 0.3, zr.u1 - 0.3]) R(u - 0.05, f.parapetTop, u + 0.05, zt, { fill: shade(INK, -0.3) });
    R(zr.u0 - lid, zt, zr.u1 + lid, zt + 0.22, { fill: '#f1efe9', stroke: INK, sw: lineW });
    R(zr.u0 - lid, zt, zr.u1 + lid, zt + 0.04, { fill: INK, opacity: 0.18 });
  }

  // silhouette, stepping with the massing
  const sil: number[] = [];
  sil.push(X(z0w.u0), Y(0));
  zones.forEach((z, k) => { sil.push(X(z.u0), Y(k ? z.z0 : 0), X(z.u0), Y(z.z1)); });
  [...zones].reverse().forEach((z, k) => { sil.push(X(z.u1), Y(z.z1), X(z.u1), Y(k === zones.length - 1 ? 0 : z.z0)); });
  pt.poly(sil, true, { stroke: INK, sw: lineW });

  // opening tags + flags
  if (o.tags) for (const op of f.openings) pt.text(X((op.u0 + op.u1) / 2), Y(op.z0) + 3.2, op.tag, { size: 1.4, font: 'mono', anchor: 'middle', fill: shade(INK, -0.3) });
  if (o.flagged) for (const op of f.openings) {
    if (!o.flagged.has(op.tag)) continue;
    R(op.u0 - 0.08, op.z0 - 0.08, op.u1 + 0.08, op.z1 + 0.08, { stroke: ACCENT, sw: W.PROJ, dash: [1.2, 0.8] });
  }

  // grid
  if (o.grid !== false && !o.simple) {
    const topY = Math.max(f.parapetTop, f.mumty?.z1 ?? 0) + 1.1;
    for (const g of f.gridU) {
      pt.line(X(g.u), Y(-0.2), X(g.u), Y(topY - 0.45), { stroke: INK, sw: W.THIN, dash: [4, 0.8, 0.6, 0.8] });
      bubble(pt, X(g.u), Y(topY), g.label);
    }
  }

  if (o.dims !== false && !o.simple) {
    // horizontal: grid chain and overall, below ground
    const us = [0, ...f.gridU.map((g) => g.u), f.width].sort((a, b) => a - b);
    chainDim(pt, 'h', us.map(X), us, Y(-1.75), Y(0));
    chainDim(pt, 'h', [X(0), X(f.width)], [0, f.width], Y(-2.45), Y(0));
    // vertical: level chain on the left
    const zs = [0, f.plinthTop, ...f.levels.slice(1).map((l) => l.ffl), f.roofZ, f.parapetTop];
    if (f.mumty) zs.push(f.mumty.z1);
    const zz = [...new Set(zs.map((z) => Math.round(z * 1000)))].sort((a, b) => a - b).map((z) => z / 1000);
    chainDim(pt, 'v', zz.map(Y), zz, X(-1.4), X(0));
    // opening heights on the right: sill / head of the first window on each level
    const byLevel = new Map<number, number[]>();
    for (const op of f.openings) if (!op.door) byLevel.set(op.levelIndex, [...(byLevel.get(op.levelIndex) ?? []), op.z0, op.z1]);
    const oz = [...new Set([...byLevel.values()].flat().map((z) => Math.round(z * 1000)))].sort((a, b) => a - b).map((z) => z / 1000);
    if (oz.length >= 2) chainDim(pt, 'v', oz.map(Y), oz, X(f.width + 0.9), X(f.width));
  }
  if (o.datums !== false && !o.simple) {
    const xr = X(f.width + 2.0);
    levelMark(pt, xr, Y(0), '±0.000', 'right', 'NGL');
    f.levels.forEach((l, i) => levelMark(pt, xr, Y(l.ffl), levelText(l.ffl), 'right', i === 0 ? 'FFL GROUND' : `FFL LEVEL ${i}`));
    levelMark(pt, xr, Y(f.roofZ), levelText(f.roofZ), 'right', 'TOS ROOF');
    levelMark(pt, xr, Y(f.parapetTop), levelText(f.parapetTop), 'right', 'TOP PARAPET');
    if (f.mumty) levelMark(pt, X(f.mumty.u1) + 4, Y(f.mumty.z1), levelText(f.mumty.z1), 'right', 'STAIR HEAD');
  }
}
