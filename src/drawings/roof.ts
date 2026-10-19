// Site & roof plan: boundary, setbacks, parking, roof with parapet, falls to outlets,
// stair head-room, facade elements seen from above.
import type { Derived } from '../model/derive.ts';
import { EXT_WALL } from '../model/units.ts';
import { SIDES, gridLines, toPlan } from '../geometry/faces.ts';
import { boxAsPrism, primBox } from './primDraw.ts';
import { View, W, type Painter } from './painter.ts';
import { INK, PAPER, mix } from './color.ts';
import { AREA, fitScale } from './sheet.ts';
import { TXT, bubble, chainDim, northArrow, scaleBar, sectionMark } from './annot.ts';
import { sectionLine } from './plan.ts';

export function roofLayout(d: Derived) {
  const s = d.project.site;
  const scale = fitScale(s.width + 6, s.depth + 5);
  const k = 1000 / scale;
  const cx = (AREA.x0 + AREA.x1) / 2, cy = (AREA.y0 + AREA.y1) / 2;
  return { view: new View(cx - (s.width / 2) * k, cy + (s.depth / 2 - 0.8) * k, k), scale };
}

export function drawRoof(pt: Painter, d: Derived, v: View, title: string, scale: number) {
  const p = d.project;
  const s = p.site, sb = s.setbacks;
  const X = v.X, Y = v.Y;
  const R = (x0: number, y0: number, x1: number, y1: number, st: Parameters<Painter['rect']>[4]) =>
    pt.rect(X(Math.min(x0, x1)), Y(Math.max(y0, y1)), Math.abs(x1 - x0) * v.k, Math.abs(y1 - y0) * v.k, st);
  // site
  R(0, 0, s.width, s.depth, { stroke: INK, sw: W.PROJ, dash: [5, 1, 1, 1] });
  R(sb.left, sb.front, s.width - sb.right, s.depth - sb.rear, { stroke: INK, sw: W.THIN, dash: [1.5, 1] });
  pt.text(X(s.width / 2), Y(0) + 6, 'ROAD', { size: TXT.label, anchor: 'middle', spacing: 0.6, weight: 500 });
  pt.line(X(-2), Y(0) + 2, X(s.width + 2), Y(0) + 2, { stroke: INK, sw: W.BEYOND });
  pt.text(X(sb.left) + 1, Y(sb.front) - 1, `SETBACK LINE`, { size: 1.3, spacing: 0.2 });
  // setback dims
  chainDim(pt, 'v', [Y(0), Y(sb.front)], [0, sb.front], X(s.width + 1.2), X(s.width));
  chainDim(pt, 'v', [Y(s.depth - sb.rear), Y(s.depth)], [s.depth - sb.rear, s.depth], X(s.width + 1.2), X(s.width));
  chainDim(pt, 'h', [X(0), X(sb.left)], [0, sb.left], Y(s.depth + 1.2), Y(s.depth));
  chainDim(pt, 'h', [X(s.width - sb.right), X(s.width)], [s.width - sb.right, s.width], Y(s.depth + 1.2), Y(s.depth));
  chainDim(pt, 'h', [X(0), X(s.width)], [0, s.width], Y(s.depth + 2.0), Y(s.depth));
  chainDim(pt, 'v', [Y(0), Y(s.depth)], [0, s.depth], X(-1.6), X(0));

  // parking bays in the front setback
  const n = p.brief.parking;
  const bayW = 2.7, bayD = Math.min(5.0, sb.front - 0.3);
  const ent = d.openings.find((o) => o.kind === 'entrance');
  const avoid = ent ? ent.center : -99;
  let x = s.width - sb.right - 0.2 - n * bayW;
  if (avoid > x - 0.8 && avoid < s.width - sb.right) x = sb.left + 0.2;
  for (let i = 0; i < n; i++) {
    const bx = x + i * bayW;
    R(bx, 0.15, bx + bayW, 0.15 + bayD, { stroke: INK, sw: W.BEYOND, fill: mix(PAPER, '#d8d3c7', 0.4) });
    for (let t = 0.4; t < bayW + bayD; t += 0.5) {
      const a = [bx + Math.min(t, bayW), 0.15 + Math.max(0, t - bayW)], b = [bx + Math.max(0, t - bayD), 0.15 + Math.min(t, bayD)];
      pt.line(X(a[0]), Y(a[1]), X(b[0]), Y(b[1]), { stroke: INK, sw: W.THIN * 0.7 });
    }
    pt.rect(X(bx + bayW / 2) - 4, Y(0.15 + bayD / 2) - 2.2, 8, 3.4, { fill: PAPER });
    pt.text(X(bx + bayW / 2), Y(0.15 + bayD / 2) + 0.4, `CAR ${i + 1}`, { size: 1.6, anchor: 'middle', font: 'mono' });
  }
  if (ent) {
    // entrance path
    R(ent.center - 0.6, 0, ent.center + 0.6, d.outer.y0 - 0.9, { stroke: INK, sw: W.BEYOND, dash: [1, 0.8] });
  }

  // building roof
  const o = d.outer;
  R(o.x0, o.y0, o.x1, o.y1, { fill: '#e9e5dc', stroke: INK, sw: W.OUTLINE });
  R(o.x0 + EXT_WALL, o.y0 + EXT_WALL, o.x1 - EXT_WALL, o.y1 - EXT_WALL, { stroke: INK, sw: W.PROJ });
  // falls to two outlets at the rear corners
  const outlets: [number, number][] = [[o.x0 + 0.45, o.y1 - 0.45], [o.x1 - 0.45, o.y1 - 0.45]];
  const sp = p.stair.position;
  for (const [ox, oy] of outlets) {
    pt.circle(X(ox), Y(oy), 0.075 * v.k + 0.4, { stroke: INK, sw: W.PROJ, fill: PAPER });
    pt.text(X(ox), Y(oy) + 3.4, 'RWP', { size: 1.3, anchor: 'middle', font: 'mono' });
  }
  const mid = (o.x0 + o.x1) / 2;
  for (const [fx, fy, tx, ty] of [[mid - 1.2, o.y0 + 1.2, outlets[0][0] + 0.6, outlets[0][1] - 0.6], [mid + 1.2, o.y0 + 1.2, outlets[1][0] - 0.6, outlets[1][1] - 0.6]]) {
    if (fx > sp.x - 0.3 && fx < sp.x + sp.w + 0.3) continue;
    pt.line(X(fx), Y(fy), X(tx), Y(ty), { stroke: INK, sw: W.BEYOND });
    const ang = Math.atan2(Y(ty) - Y(fy), X(tx) - X(fx));
    pt.poly([X(tx), Y(ty), X(tx) - Math.cos(ang - 0.4) * 2, Y(ty) - Math.sin(ang - 0.4) * 2, X(tx) - Math.cos(ang + 0.4) * 2, Y(ty) - Math.sin(ang + 0.4) * 2], true, { fill: INK });
    pt.text((X(fx) + X(tx)) / 2 + 1.5, (Y(fy) + Y(ty)) / 2, 'FALL 1:100', { size: 1.3, font: 'mono' });
  }
  // stair head-room
  R(sp.x - EXT_WALL / 2, sp.y - EXT_WALL / 2, sp.x + sp.w + EXT_WALL / 2, sp.y + sp.h + EXT_WALL / 2, { fill: '#dcd7cc', stroke: INK, sw: W.OUTLINE });
  R(sp.x + 0.3, sp.y + 0.3, sp.x + sp.w - 0.3, sp.y + 1.5, { stroke: INK, sw: W.BEYOND, dash: [1, 0.7] });
  pt.text(X(sp.x + sp.w / 2), Y(sp.y + sp.h / 2), 'STAIR HEAD', { size: 1.5, anchor: 'middle', spacing: 0.15 });
  pt.text(X(sp.x + sp.w / 2), Y(sp.y + sp.h / 2) + 2.2, 'OHT OVER', { size: 1.3, anchor: 'middle', font: 'mono' });

  // facade elements seen from above (top course only)
  for (const side of SIDES) {
    const fd = d.faces[side];
    const seen = new Set<string>();
    for (const p0 of fd.out.prims) {
      const bb = primBox(p0);
      if (bb.z1 < fd.face.parapetTop - 0.8 || bb.d1 < 0.01 || p0.kind === 'line' || p0.kind === 'disc') continue;
      const poly: [number, number][] = p0.kind === 'prismZ' ? p0.pts : p0.kind === 'box' && p0.rot ? boxAsPrism(p0).pts : [[bb.u0, bb.d0], [bb.u1, bb.d0], [bb.u1, bb.d1], [bb.u0, bb.d1]];
      const pts = poly.map(([u, dd]) => toPlan(fd.face, u, dd)).flatMap(([px, py]) => [X(px), Y(py)]);
      const key = pts.map((q) => Math.round(q * 4)).join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      pt.poly(pts, true, { fill: mix(p0.fill, PAPER, 0.3), stroke: INK, sw: W.THIN });
    }
  }
  // grid
  const g = gridLines(p);
  for (const gx of g.xs) bubble(pt, X(gx.v), Y(o.y1 + 1.6), gx.label, 2.4);
  for (const gy of g.ys) bubble(pt, X(o.x0 - 1.4), Y(gy.v), gy.label, 2.4);
  for (const gx of g.xs) pt.line(X(gx.v), Y(o.y1 + 1.25), X(gx.v), Y(o.y1), { stroke: INK, sw: W.THIN, dash: [3, 0.8] });
  for (const gy of g.ys) pt.line(X(o.x0 - 1.05), Y(gy.v), X(o.x0), Y(gy.v), { stroke: INK, sw: W.THIN, dash: [3, 0.8] });

  const sl = sectionLine(d);
  sectionMark(pt, X(sl.a[0]), Y(sl.a[1]), X(sl.b[0]), Y(sl.b[1]), sl.view[0], -sl.view[1], 'A', 'A-301');

  const ty = AREA.y1 - 3;
  pt.text(AREA.x0, ty, title, { size: TXT.title, weight: 600, spacing: 0.25 });
  pt.line(AREA.x0, ty + 1.2, AREA.x0 + 90, ty + 1.2, { stroke: INK, sw: W.PROJ });
  pt.text(AREA.x0, ty + 4.4, `SITE ${s.width.toFixed(2)} × ${s.depth.toFixed(2)} m  ·  GROUND COVERAGE ${(((o.x1 - o.x0) * (o.y1 - o.y0)) / (s.width * s.depth) * 100).toFixed(1)}%  ·  BUILT-UP ${d.builtUp.toFixed(1)} m²  ·  LAT ${s.latitude.toFixed(1)}°`, { size: 1.8, font: 'mono' });
  scaleBar(pt, AREA.x1 - 70, ty - 1, v.k, scale);
  northArrow(pt, AREA.x1 - 10, AREA.y0 + 12, s.northAngle, 7);
}
