// Site works in plan: lawns, paving, car bays, planting, boundary wall with gates, trees, and the
// rear verandah (as a cut plan on the ground floor, as a roof below from above).
import type { Derived } from '../model/derive.ts';
import type { Region } from '../geometry/region.ts';
import type { Rect } from '../geometry/rect.ts';
import { levelText } from '../model/units.ts';
import { View, W, type Painter } from './painter.ts';
import { INK, PAPER } from './color.ts';

const LAWN = '#dfe5cf', LAWN_DOT = '#b8c59f', PAVE = '#e4e0d7', PAVE_JOINT = '#cbc5b8', BED = '#cfd7bb', DECK = '#e9dfcb', CANOPY = '#e3dfd6';
const POCHE = '#2b2a27';

const rectOn = (pt: Painter, v: View, r: Rect, s: Parameters<Painter['rect']>[4]) =>
  pt.rect(v.X(r.x0), v.Y(r.y1), (r.x1 - r.x0) * v.k, (r.y1 - r.y0) * v.k, s);
const regionOn = (pt: Painter, v: View, rg: Region, s: Parameters<Painter['poly']>[2]) => {
  for (const lp of rg.loops()) pt.poly(lp.flatMap(([x, y]) => [v.X(x), v.Y(y)]), true, s);
};
const tag = (pt: Painter, v: View, x: number, y: number, t: string, sub?: string) => {
  pt.text(v.X(x), v.Y(y), t, { size: 1.5, anchor: 'middle', weight: 600, spacing: 0.2, fill: '#55604a' });
  if (sub) pt.text(v.X(x), v.Y(y) + 2.2, sub, { size: 1.15, anchor: 'middle', font: 'mono', fill: '#55604a' });
};

/** everything on the ground around the house; `labels` adds names (off on the busier floor plan) */
export function drawGround(pt: Painter, d: Derived, v: View, labels = true) {
  const w = d.works;
  pt.begin('site-works');
  // lawn with a light stipple
  for (const r of w.lawn.rects()) {
    rectOn(pt, v, r, { fill: LAWN });
    for (let y = Math.ceil(r.y0 / 0.7) * 0.7 + 0.2; y < r.y1 - 0.1; y += 0.7)
      for (let x = Math.ceil(r.x0 / 0.7) * 0.7 + ((Math.round(y / 0.7) % 2) * 0.35) + 0.1; x < r.x1 - 0.1; x += 0.7)
        pt.circle(v.X(x), v.Y(y), 0.25, { fill: LAWN_DOT });
  }
  // paving on a 600 grid
  for (const r of w.paving.rects()) {
    rectOn(pt, v, r, { fill: PAVE });
    for (let x = Math.ceil(r.x0 / 0.6) * 0.6; x < r.x1 - 0.02; x += 0.6) pt.line(v.X(x), v.Y(r.y0), v.X(x), v.Y(r.y1), { stroke: PAVE_JOINT, sw: W.THIN * 0.6 });
    for (let y = Math.ceil(r.y0 / 0.6) * 0.6; y < r.y1 - 0.02; y += 0.6) pt.line(v.X(r.x0), v.Y(y), v.X(r.x1), v.Y(y), { stroke: PAVE_JOINT, sw: W.THIN * 0.6 });
  }
  regionOn(pt, v, w.paving, { stroke: INK, sw: W.THIN });
  // car bays
  w.bays.forEach((b, i) => {
    rectOn(pt, v, b, { stroke: INK, sw: W.BEYOND });
    pt.rect(v.X((b.x0 + b.x1) / 2) - 4, v.Y((b.y0 + b.y1) / 2) - 2.2, 8, 3.4, { fill: PAPER });
    pt.text(v.X((b.x0 + b.x1) / 2), v.Y((b.y0 + b.y1) / 2) + 0.4, `CAR ${i + 1}`, { size: 1.6, anchor: 'middle', font: 'mono' });
  });
  // planting bed with shrubs
  for (const b of w.beds) {
    rectOn(pt, v, b, { fill: BED, stroke: INK, sw: W.THIN });
    for (let x = b.x0 + 0.5; x < b.x1 - 0.3; x += 0.9) pt.circle(v.X(x), v.Y((b.y0 + b.y1) / 2), 0.3 * v.k, { fill: '#b5c39a', stroke: '#7d8d66', sw: W.THIN * 0.6 });
  }
  if (labels) {
    const back = w.lawn.rects().filter((r) => r.y0 > d.outer.y1 - 0.1).sort((a, b) => (b.x1 - b.x0) * (b.y1 - b.y0) - (a.x1 - a.x0) * (a.y1 - a.y0))[0];
    if (back) tag(pt, v, (back.x0 + back.x1) / 2, (back.y0 + back.y1) / 2, 'BACKYARD LAWN', `${w.yardDepth.toFixed(1)} m DEEP`);
    if (w.patio) tag(pt, v, (w.patio.x0 + w.patio.x1) / 2, (w.patio.y0 + w.patio.y1) / 2, 'SIT-OUT', 'STONE PAVING');
    if (w.beds[0]) pt.text(v.X(w.beds[0].x0 + 0.3), v.Y(w.beds[0].y0) - 0.8, 'PLANTING BED 800', { size: 1.1, font: 'mono', fill: '#55604a' });
  }
  pt.end();
}

/** boundary wall in poché with its gates */
export function drawBoundary(pt: Painter, d: Derived, v: View, labels = true) {
  const w = d.works;
  if (!w.walls.length) return;
  pt.begin('boundary');
  for (const { r } of w.walls) rectOn(pt, v, r, { fill: POCHE, stroke: POCHE, sw: W.CUT });
  for (const g of w.gates) {
    const y = (g.y0 + g.y1) / 2;
    if (g.kind === 'car') {
      // sliding gate: leaf drawn along the wall line, track arrow
      pt.line(v.X(g.x0), v.Y(y), v.X(g.x1), v.Y(y), { stroke: INK, sw: W.PROJ, dash: [1.6, 0.6] });
      pt.line(v.X(g.x1), v.Y(y - 0.35), v.X(g.x1 - 1.2), v.Y(y - 0.35), { stroke: INK, sw: W.THIN });
      if (labels) pt.text(v.X((g.x0 + g.x1) / 2), v.Y(-0.9), 'SLIDING CAR GATE', { size: 1.2, anchor: 'middle', font: 'mono' });
    } else {
      const r = g.x1 - g.x0;
      pt.line(v.X(g.x0), v.Y(g.y1), v.X(g.x0), v.Y(g.y1 + r), { stroke: INK, sw: W.PROJ });
      pt.path(`M ${v.X(g.x0)} ${v.Y(g.y1 + r)} A ${r * v.k} ${r * v.k} 0 0 1 ${v.X(g.x1)} ${v.Y(g.y1)}`, { stroke: INK, sw: W.THIN });
      if (labels) pt.text(v.X((g.x0 + g.x1) / 2), v.Y(-0.9), 'GATE', { size: 1.2, anchor: 'middle', font: 'mono' });
    }
  }
  if (labels) {
    const side = w.walls.find((x) => x.r.x1 > d.project.site.width - 0.01 && x.r.y1 - x.r.y0 > 5);
    if (side) pt.text(v.X(side.r.x0) - 1, v.Y(d.project.site.depth * 0.45), `BOUNDARY WALL ${Math.round(side.h * 1000)} H`, { size: 1.15, font: 'mono', anchor: 'end' });
  }
  pt.end();
}

export function drawTrees(pt: Painter, d: Derived, v: View) {
  pt.begin('trees');
  for (const t of d.works.trees) {
    pt.circle(v.X(t.x), v.Y(t.y), t.r * v.k, { fill: '#9fb184', opacity: 0.55, stroke: '#5e6d4c', sw: W.THIN });
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      pt.circle(v.X(t.x + Math.cos(a) * t.r * 0.62), v.Y(t.y + Math.sin(a) * t.r * 0.62), t.r * 0.38 * v.k, { stroke: '#5e6d4c', sw: W.THIN * 0.6 });
    }
    pt.circle(v.X(t.x), v.Y(t.y), 0.12 * v.k, { fill: '#5e6d4c' });
  }
  pt.end();
}

/** the rear verandah: 'cut' on the ground floor plan, 'below' from the floor above, 'roof' on the site plan */
export function drawVerandah(pt: Painter, d: Derived, v: View, mode: 'cut' | 'below' | 'roof') {
  const vr = d.works.verandah;
  if (!vr) return;
  pt.begin('verandah');
  if (mode === 'cut') {
    rectOn(pt, v, vr.deck, { fill: DECK });
    for (let x = vr.deck.x0 + 0.14; x < vr.deck.x1 - 0.02; x += 0.14) pt.line(v.X(x), v.Y(vr.deck.y0), v.X(x), v.Y(vr.deck.y1), { stroke: '#d4c6aa', sw: W.THIN * 0.6 });
    rectOn(pt, v, vr.deck, { stroke: INK, sw: W.PROJ });
    for (let i = 0; i <= vr.nSteps; i++) pt.line(v.X(vr.steps.x0), v.Y(vr.steps.y0 + i * 0.3), v.X(vr.steps.x1), v.Y(vr.steps.y0 + i * 0.3), { stroke: INK, sw: i === vr.nSteps ? W.PROJ : W.BEYOND });
    pt.line(v.X(vr.steps.x0), v.Y(vr.steps.y0), v.X(vr.steps.x0), v.Y(vr.steps.y1), { stroke: INK, sw: W.BEYOND });
    pt.line(v.X(vr.steps.x1), v.Y(vr.steps.y0), v.X(vr.steps.x1), v.Y(vr.steps.y1), { stroke: INK, sw: W.BEYOND });
    for (const c of vr.cols) pt.rect(v.X(c.x - c.s / 2), v.Y(c.y + c.s / 2), c.s * v.k, c.s * v.k, { fill: POCHE, stroke: POCHE, sw: W.CUT });
    rectOn(pt, v, vr.canopy, { stroke: INK, sw: W.THIN, dash: [3, 0.8, 0.6, 0.8] });
    const cx = (vr.deck.x0 + vr.deck.x1) / 2 - 1.6, cy = (vr.deck.y0 + vr.deck.y1) / 2;
    pt.rect(v.X(cx) - 9, v.Y(cy) - 2.4, 18, 5.4, { fill: PAPER, opacity: 0.85 });
    pt.text(v.X(cx), v.Y(cy), 'VERANDAH', { size: 1.6, anchor: 'middle', weight: 600, spacing: 0.15 });
    pt.text(v.X(cx), v.Y(cy) + 2.4, `DECK ${levelText(d.project.brief.plinth - 0.03)} · CANOPY OVER`, { size: 1.15, anchor: 'middle', font: 'mono' });
  } else if (mode === 'below') {
    rectOn(pt, v, vr.canopy, { fill: CANOPY, stroke: INK, sw: W.BEYOND });
    pt.text(v.X((vr.canopy.x0 + vr.canopy.x1) / 2), v.Y((vr.canopy.y0 + vr.canopy.y1) / 2), 'VERANDAH ROOF BELOW', { size: 1.3, anchor: 'middle', font: 'mono' });
  } else {
    rectOn(pt, v, vr.canopy, { fill: CANOPY, stroke: INK, sw: W.OUTLINE });
    for (let y = vr.canopy.y0 + 0.5; y < vr.canopy.y1 - 0.1; y += 0.5) pt.line(v.X(vr.canopy.x0), v.Y(y), v.X(vr.canopy.x1), v.Y(y), { stroke: '#cfc9bc', sw: W.THIN * 0.6 });
    pt.text(v.X((vr.canopy.x0 + vr.canopy.x1) / 2), v.Y((vr.canopy.y0 + vr.canopy.y1) / 2), `VERANDAH ROOF ${levelText(vr.zc1)}`, { size: 1.3, anchor: 'middle', font: 'mono' });
  }
  pt.end();
}
