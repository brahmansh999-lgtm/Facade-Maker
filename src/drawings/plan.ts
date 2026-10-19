// Floor plan, cut at FFL + 1.2 m: poché walls, openings with swings and cills, stair with
// UP/DN arrows and riser count, overheads dashed, facade elements in plan, grid, dims, labels.
import type { Derived } from '../model/derive.ts';
import type { RoomType, Vec2 } from '../model/types.ts';
import { EXT_WALL, INT_WALL, levelText } from '../model/units.ts';
import { subtract1D, roomRect, area, rw, rh, type Rect } from '../geometry/rect.ts';
import { SIDES, gridLines, toPlan } from '../geometry/faces.ts';
import type { Opening } from '../geometry/openings.ts';
import type { Wall } from '../geometry/walls.ts';
import { primBox, boxAsPrism } from './primDraw.ts';
import { View, W, type Painter } from './painter.ts';
import { ACCENT, INK, PAPER, mix, shade } from './color.ts';
import { AREA, fitScale } from './sheet.ts';
import { drawFurniture } from './furniturePlan.ts';
import { Region, loopEdges } from '../geometry/region.ts';
import { drawBoundary, drawGround, drawTrees, drawVerandah } from './siteworks.ts';
import { TXT, bubble, chainDim, northArrow, runningDim, scaleBar, sectionMark } from './annot.ts';

export const POCHE = '#2b2a27';
const FILL: Partial<Record<RoomType, string>> = {
  living: '#ebe5d6', dining: '#ebe5d6', kitchen: '#e4e4dc', family: '#ece7da', foyer: '#ece7da',
  bedroom: '#efeadf', study: '#efeadf', bath: '#e1e5e2', wc: '#e1e5e2', utility: '#e1e5e2',
  store: '#e8e5de', shaft: '#d9d6cf', void: PAPER, corridor: PAPER, stair: PAPER,
};
const WET: RoomType[] = ['bath', 'wc', 'utility', 'kitchen'];

export const PLAN_MARGIN = 3.8;

/** anchored on the buildable zone (not the footprint) so the sheet stays put while rooms are dragged */
export function planLayout(d: Derived) {
  const s = d.project.site, sb = s.setbacks;
  const o = d.outer;
  // the whole plot: the ground floor plan carries the boundary wall, verandah and garden
  const b = { x0: Math.min(0, sb.left, o.x0), x1: Math.max(s.width, o.x1), y0: Math.min(0, o.y0), y1: Math.max(s.depth, o.y1) };
  const m = 3.0;
  const wM = b.x1 - b.x0 + 2 * Math.max(m, PLAN_MARGIN - Math.min(sb.left, sb.right)), hM = b.y1 - b.y0 + 2 * m;
  const scale = fitScale(wM, hM);
  const k = 1000 / scale;
  const cx = (AREA.x0 + AREA.x1) / 2, cy = (AREA.y0 + AREA.y1) / 2 - 2;
  const mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2;
  return { view: new View(cx - mx * k, cy + my * k, k), scale };
}

const wallPoint = (w: Wall, s: number, off: number): Vec2 => (w.run === 'x' ? [s, w.c + off] : [w.c + off, s]);

export function sectionLine(d: Derived): { a: Vec2; b: Vec2; view: Vec2 } {
  const st = d.stair;
  const f = st.flights[0];
  const tc = (f.t0 + f.t1) / 2;
  const o = d.outer;
  const along0 = st.axis === 'y' ? o.y0 - 1.2 : o.x0 - 1.2;
  const along1 = st.axis === 'y' ? o.y1 + 1.2 : o.x1 + 1.2;
  const p = st.toPlan(0, tc);
  const a: Vec2 = st.axis === 'y' ? [p[0], along0] : [along0, p[1]];
  const b: Vec2 = st.axis === 'y' ? [p[0], along1] : [along1, p[1]];
  // look toward the outer flight
  const sgn = st.innerAtMin ? 1 : -1;
  const view: Vec2 = st.axis === 'y' ? [sgn, 0] : [0, sgn];
  return { a, b, view };
}

export function drawPlan(pt: Painter, d: Derived, li: number, v: View, opts: { facade?: boolean; flagged?: Set<string>; scale?: number; title?: string } = {}) {
  const L = d.levels[li];
  const lvl = L.level;
  const P = (x: number, y: number): [number, number] => [v.X(x), v.Y(y)];
  const rectM = (r: Rect, s: Parameters<Painter['rect']>[4]) => pt.rect(v.X(r.x0), v.Y(r.y1), rw(r) * v.k, rh(r) * v.k, s);
  const o = d.outer;

  // ---- the plot: garden and paving, verandah (cut here, roof from above), boundary wall
  if (li === 0) { drawGround(pt, d, v, false); drawVerandah(pt, d, v, 'cut'); drawBoundary(pt, d, v, false); }
  else if (li === 1) drawVerandah(pt, d, v, 'below');

  // ---- room fills and wet-room tiling
  pt.begin('rooms');
  for (const r of lvl.rooms) {
    const b = roomRect(r);
    rectM(b, { fill: FILL[r.type] ?? PAPER });
    if (WET.includes(r.type) && r.type !== 'kitchen') {
      const c = L.clear.get(r.id)!;
      for (let x = c.x0 + 0.3; x < c.x1 - 0.01; x += 0.3) pt.line(v.X(x), v.Y(c.y0), v.X(x), v.Y(c.y1), { stroke: '#c9ccc6', sw: W.THIN * 0.7 });
      for (let y = c.y0 + 0.3; y < c.y1 - 0.01; y += 0.3) pt.line(v.X(c.x0), v.Y(y), v.X(c.x1), v.Y(y), { stroke: '#c9ccc6', sw: W.THIN * 0.7 });
    }
    if (r.type === 'void') {
      const c = L.clear.get(r.id)!;
      pt.line(v.X(c.x0), v.Y(c.y0), v.X(c.x1), v.Y(c.y1), { stroke: INK, sw: W.BEYOND, dash: [2, 1] });
      pt.line(v.X(c.x0), v.Y(c.y1), v.X(c.x1), v.Y(c.y0), { stroke: INK, sw: W.BEYOND, dash: [2, 1] });
    }
  }
  // overhead void above (double height) drawn dashed on the level below
  const above = d.levels[li + 1];
  if (above) for (const r of above.level.rooms.filter((x) => x.type === 'void')) {
    const c = above.clear.get(r.id)!;
    rectM(c, { stroke: INK, sw: W.BEYOND, dash: [2.2, 1.1] });
    const [cx, cy] = P((c.x0 + c.x1) / 2, c.y0 + 0.5);
    pt.text(cx, cy, 'DOUBLE HEIGHT OVER', { size: TXT.small, anchor: 'middle', spacing: 0.15 });
  }
  pt.end();
  drawFinishes(pt, v, L);
  drawMassingPlan(pt, d, li, v);
  drawFurniture(pt, v, L.furniture);

  // ---- grid
  const g = gridLines(d.project);
  // annotation lines sit outside the plot (the plan carries the whole site)
  const site = d.project.site;
  const aL = Math.min(o.x0, 0), aF = Math.min(o.y0, 0), aR = Math.max(o.x1, site.width), aB = Math.max(o.y1, site.depth);
  pt.begin('grid');
  for (const x of g.xs) {
    pt.line(v.X(x.v), v.Y(aF - 2.0), v.X(x.v), v.Y(o.y1 + 0.6), { stroke: INK, sw: W.THIN, dash: [4, 0.8, 0.6, 0.8] });
    bubble(pt, v.X(x.v), v.Y(aF - 2.4), x.label);
  }
  for (const y of g.ys) {
    pt.line(v.X(aL - 2.0), v.Y(y.v), v.X(o.x1 + 0.6), v.Y(y.v), { stroke: INK, sw: W.THIN, dash: [4, 0.8, 0.6, 0.8] });
    bubble(pt, v.X(aL - 2.4), v.Y(y.v), y.label);
  }
  pt.end();

  // ---- facade layer in plan (cut at +1.2, overhead dashed)
  if (opts.facade !== false) drawFacadePlan(pt, d, li, v);

  // ---- walls (poché), columns
  pt.begin('walls');
  for (const w of L.walls) {
    const ext = w.external ? EXT_WALL / 2 : INT_WALL / 2;
    const holes = L.openings.filter((op) => op.wallId === w.id).map((op) => [op.center - op.width / 2, op.center + op.width / 2] as [number, number]);
    for (const [a, b] of subtract1D(w.s0 - ext, w.s1 + ext, holes)) {
      const p0 = wallPoint(w, a, -w.thickness / 2), p1 = wallPoint(w, b, w.thickness / 2);
      const x0 = Math.min(p0[0], p1[0]), x1 = Math.max(p0[0], p1[0]), y0 = Math.min(p0[1], p1[1]), y1 = Math.max(p0[1], p1[1]);
      pt.rect(v.X(x0), v.Y(y1), (x1 - x0) * v.k, (y1 - y0) * v.k, { fill: POCHE, stroke: POCHE, sw: W.CUT });
    }
  }
  for (const x of g.xs) for (const y of g.ys) {
    if (!d.regions[li].contains(x.v, y.v)) continue;
    pt.rect(v.X(x.v - 0.115), v.Y(y.v + 0.115), 0.23 * v.k, 0.23 * v.k, { fill: POCHE, stroke: POCHE, sw: W.CUT });
  }
  pt.end();

  // ---- openings
  pt.begin('openings');
  const wallsById = new Map(L.walls.map((w) => [w.id, w]));
  for (const op of L.openings) drawOpening(pt, v, wallsById.get(op.wallId)!, op, lvl.index);
  pt.end();

  // ---- stair
  drawStairPlan(pt, d, li, v);

  // ---- labels
  pt.begin('labels');
  for (const r of lvl.rooms) {
    if (r.type === 'stair') continue;
    const c = L.clear.get(r.id)!;
    const [cx, cy] = P((c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2);
    const wmm = rw(c) * v.k, hmm = rh(c) * v.k;
    const A = area(c);
    const rot = wmm < 11 && hmm > wmm * 1.6 ? -90 : 0;
    const room = rot ? hmm : wmm;
    const nameSize = Math.min(TXT.label, Math.max(1.3, room / (r.name.length * 0.62)));
    const big = room > 14 && Math.min(wmm, hmm) > 7;
    if (rot) {
      pt.text(cx + 0.6, cy, r.name, { size: nameSize, anchor: 'middle', weight: 600, rotate: -90, spacing: 0.12 });
    } else {
      // soft backing so names stay legible over furniture
      const bw = r.name.length * nameSize * 0.72 + 2, bh = big ? 8.2 : 5;
      pt.rect(cx - bw / 2, cy - (big ? 1.2 : 0) - nameSize - 0.6, bw, bh, { fill: FILL[r.type] ?? PAPER, opacity: 0.82 });
      pt.text(cx, cy - (big ? 1.2 : 0), r.name, { size: nameSize, anchor: 'middle', weight: 600, spacing: 0.12 });
      if (big && r.type !== 'void' && r.type !== 'shaft') {
        pt.text(cx, cy + 1.9, `${A.toFixed(2)} m²`, { size: TXT.small, anchor: 'middle', font: 'mono' });
        if (hmm > 14) pt.text(cx, cy + 4.0, `${rw(c).toFixed(2)} × ${rh(c).toFixed(2)}`, { size: 1.3, anchor: 'middle', font: 'mono', fill: shade(INK, -0.35) });
      } else if (r.type !== 'void' && r.type !== 'shaft' && r.type !== 'corridor') {
        pt.text(cx, cy + 1.9, A.toFixed(1), { size: 1.3, anchor: 'middle', font: 'mono' });
      }
    }
    // room tag: number and clear ceiling height, tucked in the room's lower-left corner
    if (r.type !== 'void' && r.type !== 'shaft' && r.type !== 'corridor' && wmm > 19 && hmm > 14) {
      const no = `${lvl.index === 0 ? 'G' : lvl.index}.${String(lvl.rooms.indexOf(r) + 1).padStart(2, '0')}`;
      const tx = v.X(c.x0) + 1.0, ty = v.Y(c.y0) - 1.0;
      pt.rect(tx, ty - 2.4, 7.6, 2.4, { fill: PAPER, stroke: INK, sw: W.THIN });
      pt.text(tx + 3.8, ty - 0.65, no, { size: 1.35, anchor: 'middle', font: 'mono', weight: 500 });
      pt.text(tx + 8.4, ty - 0.65, `CH ${(d.project.brief.floorToFloor - 0.15).toFixed(2)}`, { size: 1.2, font: 'mono', fill: shade(INK, -0.35) });
    }
    if (opts.flagged?.has(r.id)) pt.rect(v.X(c.x0) + 0.8, v.Y(c.y1) + 0.8, wmm - 1.6, hmm - 1.6, { stroke: ACCENT, sw: W.PROJ, dash: [1.4, 0.9] });
  }
  // level datum in the main corridor
  const cor = lvl.rooms.filter((r) => r.type === 'corridor').sort((a, b) => area(roomRect(b)) - area(roomRect(a)))[0];
  if (cor) {
    const c = L.clear.get(cor.id)!;
    const [cx, cy] = P((c.x0 + c.x1) / 2, c.y0 + Math.min(1.6, rh(c) * 0.25));
    pt.rect(cx - 5.2, cy - 2.2, 10.4, 3.2, { fill: PAPER, stroke: INK, sw: W.THIN });
    pt.text(cx, cy, levelText(lvl.elevation), { size: 1.6, anchor: 'middle', font: 'mono' });
  }
  pt.end();

  // ---- entry steps and arrow
  if (lvl.index === 0) {
    const ent = L.openings.find((x) => x.kind === 'entrance');
    if (ent && ent.side === 'front') {
      const y = ent.c - EXT_WALL / 2;
      const nSteps = Math.max(1, Math.round(d.project.brief.plinth / 0.15));
      for (let i = 0; i <= nSteps; i++) {
        const yy = y - i * 0.3;
        pt.line(v.X(ent.center - ent.width / 2 - 0.3), v.Y(yy), v.X(ent.center + ent.width / 2 + 0.3), v.Y(yy), { stroke: INK, sw: i === nSteps ? W.PROJ : W.BEYOND });
      }
      pt.line(v.X(ent.center - ent.width / 2 - 0.3), v.Y(y), v.X(ent.center - ent.width / 2 - 0.3), v.Y(y - nSteps * 0.3), { stroke: INK, sw: W.BEYOND });
      pt.line(v.X(ent.center + ent.width / 2 + 0.3), v.Y(y), v.X(ent.center + ent.width / 2 + 0.3), v.Y(y - nSteps * 0.3), { stroke: INK, sw: W.BEYOND });
      const ax = v.X(ent.center), ay0 = v.Y(y - nSteps * 0.3 - 0.9), ay1 = v.Y(y - 0.15);
      pt.line(ax, ay0, ax, ay1, { stroke: INK, sw: W.PROJ });
      pt.poly([ax, ay1, ax - 0.9, ay1 + 2.2, ax + 0.9, ay1 + 2.2], true, { fill: INK });
      pt.text(ax + 1.6, ay0, 'ENTRY', { size: TXT.small, spacing: 0.2, weight: 500 });
    }
  }

  if (li === 0) drawTrees(pt, d, v);

  // ---- dimensions
  const fy0 = v.Y(o.y0), fy1 = v.Y(o.y1), fx0 = v.X(o.x0), fx1 = v.X(o.x1);
  const gxs = g.xs.map((x) => x.v), gys = g.ys.map((y) => y.v);
  // front: grid chain, then overall (outer faces)
  chainDim(pt, 'h', gxs.map(v.X), gxs, v.Y(aF - 0.7), fy0);
  chainDim(pt, 'h', [fx0, fx1], [o.x0, o.x1], v.Y(aF - 1.35), fy0);
  // left: grid chain + overall
  chainDim(pt, 'v', gys.map(v.Y), gys, v.X(aL - 0.7), fx0);
  chainDim(pt, 'v', [fy0, fy1], [o.y0, o.y1], v.X(aL - 1.35), fx0);
  // rear: running dims to every wall line; right: running dims along the depth
  const xsAll = [...new Set(lvl.rooms.flatMap((r) => [roomRect(r).x0, roomRect(r).x1]).map((x) => Math.round(x * 1000)))].sort((a, b) => a - b).map((x) => x / 1000);
  const ysAll = [...new Set(lvl.rooms.flatMap((r) => [roomRect(r).y0, roomRect(r).y1]).map((y) => Math.round(y * 1000)))].sort((a, b) => a - b).map((y) => y / 1000);
  runningDim(pt, 'h', xsAll.map(v.X), xsAll, v.Y(aB + 0.8), fy1);
  runningDim(pt, 'v', ysAll.map(v.Y), ysAll, v.X(aR + 0.8), fx1);

  // ---- section mark
  const sl = sectionLine(d);
  sectionMark(pt, v.X(sl.a[0]), v.Y(sl.a[1]), v.X(sl.b[0]), v.Y(sl.b[1]), sl.view[0], -sl.view[1], 'A', 'A-301');

  // ---- drawing label, north, scale bar
  const scale = opts.scale ?? Math.round(1000 / v.k);
  const ty = AREA.y1 - 3;
  pt.text(AREA.x0, ty, opts.title ?? '', { size: TXT.title, weight: 600, spacing: 0.25 });
  pt.line(AREA.x0, ty + 1.2, AREA.x0 + 90, ty + 1.2, { stroke: INK, sw: W.PROJ });
  pt.text(AREA.x0, ty + 4.4, `FFL ${levelText(lvl.elevation)}  ·  BUILT-UP ${area(d.outlines[li]).toFixed(1)} m² THIS FLOOR  ·  1:${scale}`, { size: 1.8, font: 'mono' });
  scaleBar(pt, AREA.x1 - 70, ty - 1, v.k, scale);
  northArrow(pt, AREA.x1 - 8, AREA.y0 + 10, d.project.site.northAngle);
}

function drawOpening(pt: Painter, v: View, w: Wall, op: Opening, levelIndex: number) {
  const t = w.thickness;
  const s0 = op.center - op.width / 2, s1 = op.center + op.width / 2;
  const S = (s: number, off: number) => { const p = wallPoint(w, s, off); return [v.X(p[0]), v.Y(p[1])] as [number, number]; };
  const ln = (a: [number, number], b: [number, number], sw: number, dash?: number[]) => pt.line(a[0], a[1], b[0], b[1], { stroke: INK, sw, dash });
  const outSign = w.external ? (w.neg === null ? -1 : 1) : 1;
  void levelIndex;
  if (op.kind === 'window' || op.kind === 'ventilator') {
    // jambs, frame, glass, cill outside
    ln(S(s0, -t / 2), S(s0, t / 2), W.PROJ);
    ln(S(s1, -t / 2), S(s1, t / 2), W.PROJ);
    if (op.kind === 'window') {
      ln(S(s0, -t / 6), S(s1, -t / 6), W.PROJ);
      ln(S(s0, t / 6), S(s1, t / 6), W.PROJ);
      ln(S(s0, 0), S(s1, 0), W.THIN);
      for (let i = 1; i < op.leaves; i++) { const s = s0 + ((s1 - s0) * i) / op.leaves; ln(S(s, -t / 6), S(s, t / 6), W.THIN); }
    } else {
      ln(S(s0, 0), S(s1, 0), W.PROJ);
    }
    const co = outSign * (t / 2 + 0.05);
    ln(S(s0 - 0.05, outSign * t / 2), S(s0 - 0.05, co), W.BEYOND);
    ln(S(s1 + 0.05, outSign * t / 2), S(s1 + 0.05, co), W.BEYOND);
    ln(S(s0 - 0.05, co), S(s1 + 0.05, co), W.BEYOND);
    ln(S(s0, -outSign * t / 2), S(s1, -outSign * t / 2), W.BEYOND);
    const tp = S(op.center, outSign * (t / 2 + 0.38));
    pt.text(tp[0], tp[1] + 0.6, op.tag, { size: 1.5, font: 'mono', anchor: 'middle', rotate: w.run === 'y' ? -90 : 0 });
    return;
  }
  if (op.kind === 'opening') {
    ln(S(s0, -t / 2), S(s1, -t / 2), W.BEYOND, [1.2, 0.8]);
    ln(S(s0, t / 2), S(s1, t / 2), W.BEYOND, [1.2, 0.8]);
    return;
  }
  // doors: leaf + swing into the room
  const inSign = op.swingInto ? (w.pos === op.swingInto ? 1 : -1) : -outSign;
  const leaves = op.leaves;
  const lw = (s1 - s0) / leaves;
  for (let i = 0; i < leaves; i++) {
    const hinge = i === 0 ? s0 : s1;
    const dirS = i === 0 ? 1 : -1;
    const h = S(hinge, inSign * t / 2);
    const tip = S(hinge, inSign * (t / 2 + lw));
    const jamb = S(hinge + dirS * lw, inSign * t / 2);
    pt.line(h[0], h[1], tip[0], tip[1], { stroke: INK, sw: W.OUTLINE });
    const r = lw * v.k;
    const a0 = Math.atan2(tip[1] - h[1], tip[0] - h[0]), a1 = Math.atan2(jamb[1] - h[1], jamb[0] - h[0]);
    let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    pt.path(`M ${tip[0].toFixed(3)} ${tip[1].toFixed(3)} A ${r.toFixed(3)} ${r.toFixed(3)} 0 0 ${da > 0 ? 1 : 0} ${jamb[0].toFixed(3)} ${jamb[1].toFixed(3)}`, { stroke: INK, sw: W.BEYOND });
  }
  ln(S(s0, -t / 2), S(s0, t / 2), W.PROJ);
  ln(S(s1, -t / 2), S(s1, t / 2), W.PROJ);
  if (op.external) {
    const tp = S(op.center, outSign * (t / 2 + 0.38));
    pt.text(tp[0], tp[1] + 0.6, op.tag, { size: 1.5, font: 'mono', anchor: 'middle', rotate: w.run === 'y' ? -90 : 0 });
  }
}

function drawStairPlan(pt: Painter, d: Derived, li: number, v: View) {
  const st = d.stair;
  const PP = (s: number, t: number) => { const p = st.toPlan(s, t); return [v.X(p[0]), v.Y(p[1])] as [number, number]; };
  const ln = (a: [number, number], b: [number, number], sw: number, dash?: number[]) => pt.line(a[0], a[1], b[0], b[1], { stroke: INK, sw, dash });
  const cutZ = 1.2;
  pt.begin('stair');
  st.flights.forEach((f, fi) => {
    const below = fi === 1 && li > 0;          // outer flight seen below (arriving from the level below)
    const sEnd = f.sStart + f.dir * (f.risers - 1) * st.T;
    const cutK = Math.floor((cutZ - f.zStart) / st.R);
    // stringers
    for (const t of [f.t0, f.t1]) ln(PP(f.sStart, t), PP(sEnd, t), W.PROJ);
    for (let k = 0; k < f.risers; k++) {
      const s = f.sStart + f.dir * k * st.T;
      const solid = st.type === 'straight' || below || k <= cutK;
      ln(PP(s, f.t0), PP(s, f.t1), solid ? W.PROJ : W.BEYOND, solid ? undefined : [1.2, 0.8]);
    }
    if (fi === 0 && cutK >= 0 && cutK < f.risers - 1) {
      // break line
      const sc = f.sStart + f.dir * (cutK + 0.5) * st.T;
      const w = f.t1 - f.t0;
      const pts = [PP(sc - f.dir * 0.25, f.t0), PP(sc - f.dir * 0.05, f.t0 + w * 0.45), PP(sc + f.dir * 0.08, f.t0 + w * 0.5), PP(sc - f.dir * 0.02, f.t0 + w * 0.55), PP(sc + f.dir * 0.25, f.t1)];
      pt.poly(pts.flat(), false, { stroke: INK, sw: W.PROJ });
    }
  });
  for (const l of st.landings) {
    const a = PP(l.s0, l.t0), b = PP(l.s1, l.t1);
    pt.rect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), { stroke: INK, sw: W.BEYOND, dash: li > 0 ? undefined : [1.2, 0.8] });
  }
  // UP arrow along the walking line
  const f0 = st.flights[0];
  const tc0 = (f0.t0 + f0.t1) / 2;
  const path: [number, number][] = [PP(f0.sStart - 0.15, tc0)];
  const end0 = f0.sStart + f0.dir * (f0.risers - 1) * st.T;
  if (st.type === 'dogleg') {
    const f1 = st.flights[1];
    const tc1 = (f1.t0 + f1.t1) / 2;
    const lm = (st.landings[0].s0 + st.landings[0].s1) / 2;
    path.push(PP(end0, tc0), PP(lm, tc0), PP(lm, tc1), PP(f1.sStart + f1.dir * (f1.risers - 1) * st.T + f1.dir * 0.2, tc1));
  } else {
    path.push(PP(end0 + 0.3, tc0));
  }
  pt.poly(path.flat(), false, { stroke: INK, sw: W.BEYOND });
  const [ex, ey] = path[path.length - 1], [px, py] = path[path.length - 2];
  const ang = Math.atan2(ey - py, ex - px);
  pt.poly([ex, ey, ex - Math.cos(ang - 0.35) * 2, ey - Math.sin(ang - 0.35) * 2, ex - Math.cos(ang + 0.35) * 2, ey - Math.sin(ang + 0.35) * 2], true, { fill: INK });
  pt.circle(path[0][0], path[0][1], 0.6, { fill: INK });
  const lbl = PP(f0.sStart - 0.55, tc0);
  pt.text(lbl[0], lbl[1] + 0.7, `UP ${st.n}R`, { size: 1.7, anchor: 'middle', font: 'mono', weight: 500 });
  if (li > 0 && st.type === 'dogleg') {
    const f1 = st.flights[1];
    const tc1 = (f1.t0 + f1.t1) / 2;
    const p = PP(f1.sStart + f1.dir * (f1.risers - 1) * st.T - 0.45 * f1.dir, tc1);
    pt.text(p[0], p[1] + 0.7, 'DN', { size: 1.7, anchor: 'middle', font: 'mono', weight: 500 });
  }
  pt.end();
}

function drawFacadePlan(pt: Painter, d: Derived, li: number, v: View) {
  const lvl = d.levels[li].level;
  const cutZ = lvl.elevation + 1.2;
  const topZ = d.levels[li + 1]?.level.elevation ?? d.faces.front.face.parapetTop;
  pt.begin('facade-plan');
  for (const side of SIDES) {
    const fd = d.faces[side];
    const seen = new Set<string>();
    for (const p0 of fd.out.prims) {
      const bb = primBox(p0);
      const cut = bb.z0 <= cutZ && bb.z1 >= cutZ;
      const over = !cut && bb.z0 > cutZ && bb.z0 < topZ - 0.05;
      if (!cut && !over) continue;
      let poly: [number, number][] | null = null;
      if (p0.kind === 'box') poly = p0.rot ? boxAsPrism(p0).pts : [[p0.u, p0.d0], [p0.u + p0.w, p0.d0], [p0.u + p0.w, p0.d1], [p0.u, p0.d1]];
      else if (p0.kind === 'prismZ') poly = p0.pts;
      else if (p0.kind === 'prismU' || p0.kind === 'perf' || p0.kind === 'mesh') poly = [[bb.u0, bb.d0], [bb.u1, bb.d0], [bb.u1, Math.max(bb.d1, bb.d0 + 0.01)], [bb.u0, Math.max(bb.d1, bb.d0 + 0.01)]];
      else if (p0.kind === 'line' && p0.role === 'screen' && cut) {
        const q = toPlan(fd.face, p0.pts[0][0], p0.pts[0][2]);
        const key = `c${Math.round(q[0] * 100)},${Math.round(q[1] * 100)}`;
        if (!seen.has(key)) { seen.add(key); pt.circle(v.X(q[0]), v.Y(q[1]), 0.35, { fill: INK }); }
        continue;
      }
      const ins = fd.face.zones.find((z) => bb.z0 >= z.z0 - 0.02 && bb.z0 < z.z1)?.inset ?? 0;
      if (!poly || bb.d1 + ins < 0.005) continue;
      const pts = poly.map(([u, dd]) => toPlan(fd.face, u, dd)).flatMap(([x, y]) => [v.X(x), v.Y(y)]);
      const key = (over ? 'o' : 'c') + pts.map((n) => Math.round(n * 5)).join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      if (cut) pt.poly(pts, true, { fill: mix(p0.fill, PAPER, 0.25), stroke: INK, sw: W.BEYOND });
      else pt.poly(pts, true, { stroke: INK, sw: W.THIN, dash: [1.0, 0.7] });
    }
  }
  pt.end();
}

/** light floor-finish patterns: timber boards, large-format tiles */
const BOARDS: RoomType[] = ['bedroom', 'study', 'family'];
const TILES: Partial<Record<RoomType, number>> = { living: 0.8, dining: 0.8, foyer: 0.8, corridor: 0.8, kitchen: 0.6, store: 0.6 };
function drawFinishes(pt: Painter, v: View, L: Derived['levels'][number]) {
  pt.begin('finishes');
  const s = { stroke: '#d8d1c1', sw: W.THIN * 0.6 };
  for (const r of L.level.rooms) {
    const c = L.clear.get(r.id)!;
    if (BOARDS.includes(r.type)) {
      const along = rw(c) >= rh(c);
      // boards run the long way; staggered end joints every 2.4 m
      if (along) for (let y = c.y0 + 0.18, k = 0; y < c.y1 - 0.02; y += 0.18, k++) {
        pt.line(v.X(c.x0), v.Y(y), v.X(c.x1), v.Y(y), s);
        for (let x = c.x0 + ((k * 0.8) % 2.4) + 0.4; x < c.x1; x += 2.4) pt.line(v.X(x), v.Y(y), v.X(x), v.Y(y - 0.18), s);
      } else for (let x = c.x0 + 0.18, k = 0; x < c.x1 - 0.02; x += 0.18, k++) {
        pt.line(v.X(x), v.Y(c.y0), v.X(x), v.Y(c.y1), s);
        for (let y = c.y0 + ((k * 0.8) % 2.4) + 0.4; y < c.y1; y += 2.4) pt.line(v.X(x), v.Y(y), v.X(x - 0.18), v.Y(y), s);
      }
    } else if (TILES[r.type]) {
      const t = TILES[r.type]!;
      const x0 = (c.x0 + c.x1) / 2 - Math.floor(rw(c) / 2 / t) * t, y0 = (c.y0 + c.y1) / 2 - Math.floor(rh(c) / 2 / t) * t;
      for (let x = x0; x < c.x1 - 0.02; x += t) if (x > c.x0 + 0.02) pt.line(v.X(x), v.Y(c.y0), v.X(x), v.Y(c.y1), s);
      for (let y = y0; y < c.y1 - 0.02; y += t) if (y > c.y0 + 0.02) pt.line(v.X(c.x0), v.Y(y), v.X(c.x1), v.Y(y), s);
    }
  }
  pt.end();
}

/** covered porch under a cantilever, roof terraces, overhead cantilever, columns and roof lid */
function drawMassingPlan(pt: Painter, d: Derived, li: number, v: View) {
  const rg = d.regions, cur = rg[li], above = rg[li + 1], below = rg[li - 1];
  const R = (r: Rect, s: Parameters<Painter['rect']>[4]) => pt.rect(v.X(r.x0), v.Y(r.y1), rw(r) * v.k, rh(r) * v.k, s);
  const outline = (r: Region, s: Parameters<Painter['poly']>[2]) => { for (const lp of r.loops()) pt.poly(lp.flatMap(([x, y]) => [v.X(x), v.Y(y)]), true, s); };
  const label = (r: Rect, t: string, sub?: string) => {
    const cx = v.X((r.x0 + r.x1) / 2), cy = v.Y((r.y0 + r.y1) / 2);
    pt.rect(cx - t.length * 0.62 - 1, cy - 2.2, t.length * 1.24 + 2, sub ? 5.2 : 3.2, { fill: PAPER, opacity: 0.85 });
    pt.text(cx, cy, t, { size: 1.6, anchor: 'middle', weight: 600, spacing: 0.15 });
    if (sub) pt.text(cx, cy + 2.4, sub, { size: 1.25, anchor: 'middle', font: 'mono' });
  };
  const biggest = (r: Region) => r.rects().sort((a, b) => area(b) - area(a))[0];
  pt.begin('massing');
  // covered porch: open ground under the floor above where that floor projects
  if (above) {
    const cov = above.minus(cur);
    if (!cov.empty && cov.area() > 0.5) {
      for (const r of cov.rects()) {
        R(r, { fill: '#e7e2d6' });
        for (let x = Math.ceil(r.x0 / 0.6) * 0.6; x < r.x1 - 0.05; x += 0.6) pt.line(v.X(x), v.Y(r.y0), v.X(x), v.Y(r.y1), { stroke: '#cfc7b6', sw: W.THIN * 0.7 });
        for (let y = Math.ceil(r.y0 / 0.6) * 0.6; y < r.y1 - 0.05; y += 0.6) pt.line(v.X(r.x0), v.Y(y), v.X(r.x1), v.Y(y), { stroke: '#cfc7b6', sw: W.THIN * 0.7 });
      }
      outline(cov, { stroke: INK, sw: W.BEYOND, dash: [2.2, 1.1] });
      const big = biggest(cov), proj = cur.bbox().y0 - above.bbox().y0;
      label(big, li === 0 ? 'COVERED PORCH' : 'COVERED DECK', proj > 0.3 ? `CANTILEVER ${proj.toFixed(2)} OVER` : 'FLOOR OVER');
    }
  }
  // this floor projects past the one below: dashed line of the floor below inside this outline
  if (below) {
    for (const lp of below.loops()) for (const e of loopEdges(lp)) {
      const mx = (e.a[0] + e.b[0]) / 2, my = (e.a[1] + e.b[1]) / 2;
      if (!cur.contains(mx + e.n[0] * 0.05, my + e.n[1] * 0.05) || !cur.contains(mx - e.n[0] * 0.05, my - e.n[1] * 0.05)) continue;
      pt.line(v.X(e.a[0]), v.Y(e.a[1]), v.X(e.b[0]), v.Y(e.b[1]), { stroke: INK, sw: W.THIN, dash: [1.4, 0.9] });
    }
    const cant = cur.minus(below);
    if (!cant.empty && cant.area() > 0.5) {
      const r = biggest(cant);
      pt.text(v.X(r.x0) + 1, v.Y(r.y0) - 1, `CANTILEVER ${(below.bbox().y0 - cur.bbox().y0).toFixed(2)} · LINE OF FLOOR BELOW DASHED`, { size: 1.2, font: 'mono' });
    }
  }
  // terrace on the roof of the floor below, left by this floor stepping back
  if (below) {
    const deck = below.minus(cur);
    for (const t of deck.rects()) {
      R(t, { fill: '#ebe4d4' });
      const along = rw(t) >= rh(t);
      if (along) for (let y = t.y0 + 0.14; y < t.y1 - 0.02; y += 0.14) pt.line(v.X(t.x0), v.Y(y), v.X(t.x1), v.Y(y), { stroke: '#cbbfa5', sw: W.THIN * 0.7 });
      else for (let x = t.x0 + 0.14; x < t.x1 - 0.02; x += 0.14) pt.line(v.X(x), v.Y(t.y0), v.X(x), v.Y(t.y1), { stroke: '#cbbfa5', sw: W.THIN * 0.7 });
    }
    // glass balustrade on the open edges
    for (const lp of deck.loops()) for (const e of loopEdges(lp)) {
      const mx = (e.a[0] + e.b[0]) / 2, my = (e.a[1] + e.b[1]) / 2;
      if (cur.contains(mx + e.n[0] * 0.05, my + e.n[1] * 0.05)) continue;
      for (const off of [0.0, 0.06]) pt.line(v.X(e.a[0] - e.n[0] * off), v.Y(e.a[1] - e.n[1] * off), v.X(e.b[0] - e.n[0] * off), v.Y(e.b[1] - e.n[1] * off), { stroke: INK, sw: W.PROJ });
    }
    if (!deck.empty && deck.area() > 1) {
      const t = biggest(deck);
      label({ ...t, x1: t.x0 + Math.min(3.4, rw(t)) }, 'ROOF TERRACE', `FFL ${levelText(d.levels[li].level.elevation - 0.03)} · FALL 1:80`);
    }
  }
  // columns under a cantilever
  if (li === 0) for (const c of d.columns) {
    pt.rect(v.X(c.x - c.s / 2), v.Y(c.y + c.s / 2), c.s * v.k, c.s * v.k, { fill: POCHE, stroke: POCHE, sw: W.CUT });
    pt.text(v.X(c.x) + 2.2, v.Y(c.y) + 0.6, 'C1 300×300 RCC', { size: 1.15, font: 'mono' });
  }
  // roof lid over the top floor
  const lid = d.project.massing?.lid ?? 0;
  if (li === d.levels.length - 1 && lid > 0) {
    const r = cur.inflate(lid);
    outline(r, { stroke: INK, sw: W.THIN, dash: [3, 0.8, 0.6, 0.8] });
    const bb = r.bbox();
    pt.text(v.X(bb.x0) + 1, v.Y(bb.y0) - 1, `ROOF LID OVER (+${lid.toFixed(2)})`, { size: 1.2, font: 'mono' });
  }
  pt.end();
}
