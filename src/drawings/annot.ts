// Drawing conventions: dimensions, grid bubbles, level datums, north arrow, scale bar, section marks.
import { W, type Painter } from './painter.ts';
import { ACCENT, INK, PAPER } from './color.ts';

const TICK = 1.1;
export const TXT = { dim: 1.8, label: 2.3, small: 1.6, title: 3.2 };
const mmTxt = (m: number) => String(Math.round(m * 1000));

/**
 * Chain dimension. `pts` are sheet positions along the axis (sorted), `values` the model positions
 * (metres) used for the text. `at` is the sheet coordinate of the dimension line, `from` where
 * extension lines start (the building face).
 */
export function chainDim(pt: Painter, axis: 'h' | 'v', pts: number[], values: number[], at: number, from: number) {
  pt.begin('dims');
  const s = { stroke: INK, sw: W.THIN };
  const dir = at > from ? 1 : -1;
  const ext = (p: number) => {
    if (axis === 'h') pt.line(p, from + dir * 1.0, p, at + dir * 1.2, s);
    else pt.line(from + dir * 1.0, p, at + dir * 1.2, p, s);
  };
  const tick = (p: number) => {
    if (axis === 'h') pt.line(p - TICK / 2, at + TICK / 2, p + TICK / 2, at - TICK / 2, { stroke: INK, sw: W.PROJ });
    else pt.line(at - TICK / 2, p + TICK / 2, at + TICK / 2, p - TICK / 2, { stroke: INK, sw: W.PROJ });
  };
  const a = pts[0], b = pts[pts.length - 1];
  if (axis === 'h') pt.line(a - 1.5, at, b + 1.5, at, s); else pt.line(at, a + 1.5 * Math.sign(a - b || 1), at, b - 1.5 * Math.sign(a - b || 1), s);
  pts.forEach((p) => { ext(p); tick(p); });
  for (let i = 0; i < pts.length - 1; i++) {
    const m = (pts[i] + pts[i + 1]) / 2;
    const len = Math.abs(values[i + 1] - values[i]);
    if (len < 1e-4) continue;
    const span = Math.abs(pts[i + 1] - pts[i]);
    const txt = mmTxt(len);
    const off = span < txt.length * 1.15 ? (i % 2 ? 2.6 : -0.6) : -0.6;
    if (axis === 'h') pt.text(m, at + off, txt, { size: TXT.dim, font: 'mono', anchor: 'middle' });
    else pt.text(at + off, m, txt, { size: TXT.dim, font: 'mono', anchor: 'middle', rotate: -90 });
  }
  pt.end();
}

/** running dimension: origin circle, cumulative values written along the ticks */
export function runningDim(pt: Painter, axis: 'h' | 'v', pts: number[], values: number[], at: number, from: number) {
  pt.begin('dims');
  const s = { stroke: INK, sw: W.THIN };
  const dir = at > from ? 1 : -1;
  const a = pts[0], b = pts[pts.length - 1];
  if (axis === 'h') pt.line(a, at, b + 1.5, at, s); else pt.line(at, a, at, b + 1.5 * Math.sign(b - a || 1), s);
  const v0 = values[0];
  pts.forEach((p, i) => {
    if (axis === 'h') {
      pt.line(p, from + dir * 1.0, p, at + dir * 1.2, s);
      if (i === 0) pt.circle(p, at, 0.6, { stroke: INK, sw: W.THIN, fill: PAPER });
      else {
        pt.line(p - TICK / 2, at + TICK / 2, p + TICK / 2, at - TICK / 2, { stroke: INK, sw: W.PROJ });
        pt.text(p - 0.5, at - dir * 1.0 + (dir < 0 ? 0 : 0), mmTxt(Math.abs(values[i] - v0)), { size: TXT.small, font: 'mono', rotate: -90, anchor: dir < 0 ? 'start' : 'end' });
      }
    } else {
      pt.line(from + dir * 1.0, p, at + dir * 1.2, p, s);
      if (i === 0) pt.circle(at, p, 0.6, { stroke: INK, sw: W.THIN, fill: PAPER });
      else {
        pt.line(at - TICK / 2, p + TICK / 2, at + TICK / 2, p - TICK / 2, { stroke: INK, sw: W.PROJ });
        pt.text(at - dir * 1.0, p - 0.5, mmTxt(Math.abs(values[i] - v0)), { size: TXT.small, font: 'mono', anchor: dir < 0 ? 'end' : 'start' });
      }
    }
  });
  pt.end();
}

export function bubble(pt: Painter, x: number, y: number, label: string, r = 3.2) {
  pt.circle(x, y, r, { stroke: INK, sw: W.PROJ, fill: PAPER });
  pt.text(x, y + 0.1, label, { size: 2.6, anchor: 'middle', baseline: 'middle', weight: 500 });
}

/** level datum: open/filled half-circle target with leader and text */
export function levelMark(pt: Painter, x: number, y: number, text: string, side: 'left' | 'right', name?: string) {
  const r = 1.4;
  const s = side === 'right' ? 1 : -1;
  pt.circle(x, y, r, { stroke: INK, sw: W.BEYOND, fill: PAPER });
  pt.path(`M ${x} ${y - r} A ${r} ${r} 0 0 ${s > 0 ? 1 : 0} ${x + s * r} ${y} L ${x} ${y} Z`, { fill: INK });
  pt.path(`M ${x} ${y + r} A ${r} ${r} 0 0 ${s > 0 ? 0 : 1} ${x - s * r} ${y} L ${x} ${y} Z`, { fill: INK });
  pt.line(x + s * r, y, x + s * 16, y, { stroke: INK, sw: W.THIN });
  pt.text(x + s * 2.4, y - 0.7, text, { size: TXT.dim, font: 'mono', anchor: s > 0 ? 'start' : 'end' });
  if (name) pt.text(x + s * 2.4, y + 2.2, name, { size: 1.4, anchor: s > 0 ? 'start' : 'end', spacing: 0.15 });
}

export function northArrow(pt: Painter, x: number, y: number, northAngle: number, r = 6) {
  pt.circle(x, y, r, { stroke: INK, sw: W.BEYOND });
  const a = (northAngle * Math.PI) / 180;
  // plan-up is sheet-up; north is rotated clockwise by northAngle
  const tip = [x + Math.sin(a) * r * 0.95, y - Math.cos(a) * r * 0.95];
  const l = [x + Math.sin(a + 2.6) * r * 0.55, y - Math.cos(a + 2.6) * r * 0.55];
  const rr = [x + Math.sin(a - 2.6) * r * 0.55, y - Math.cos(a - 2.6) * r * 0.55];
  pt.poly([tip[0], tip[1], l[0], l[1], x, y], true, { fill: INK, stroke: INK, sw: W.THIN });
  pt.poly([tip[0], tip[1], rr[0], rr[1], x, y], true, { fill: PAPER, stroke: INK, sw: W.THIN });
  pt.text(x + Math.sin(a) * (r + 2.6), y - Math.cos(a) * (r + 2.6) + 1, 'N', { size: 2.6, anchor: 'middle', weight: 600 });
}

export function scaleBar(pt: Painter, x: number, y: number, k: number, scale: number) {
  const segs = scale <= 100 ? [0, 1, 2, 3, 4, 5] : [0, 2, 4, 6, 8, 10];
  for (let i = 0; i < segs.length - 1; i++) {
    pt.rect(x + segs[i] * k, y, (segs[i + 1] - segs[i]) * k, 1.2, { fill: i % 2 ? PAPER : INK, stroke: INK, sw: W.THIN });
  }
  for (const s of [segs[0], segs[1], segs[segs.length - 1]]) pt.text(x + s * k, y + 3.6, String(s), { size: 1.6, font: 'mono', anchor: 'middle' });
  pt.text(x + segs[segs.length - 1] * k + 2, y + 1.2, 'm', { size: 1.6, font: 'mono' });
  pt.text(x, y - 1.4, `SCALE 1:${scale}`, { size: 1.6, font: 'mono', spacing: 0.1 });
}

/** section cut mark on plan: bold end segments, bubble, arrow pointing the view direction */
export function sectionMark(pt: Painter, ax: number, ay: number, bx: number, by: number, vx: number, vy: number, label: string, sheet: string) {
  const len = Math.hypot(bx - ax, by - ay) || 1;
  const ux = (bx - ax) / len, uy = (by - ay) / len;
  pt.line(ax, ay, bx, by, { stroke: INK, sw: W.BEYOND, dash: [6, 1, 1, 1] });
  for (const [px, py, sgn] of [[ax, ay, 1], [bx, by, -1]] as const) {
    pt.line(px, py, px + ux * 5 * sgn, py + uy * 5 * sgn, { stroke: INK, sw: W.CUT * 1.4 });
    const cx = px - ux * 4 * sgn, cy = py - uy * 4 * sgn;
    pt.poly([cx + vx * 4.2, cy + vy * 4.2, cx + -vy * 2.2, cy + vx * 2.2, cx - -vy * 2.2, cy - vx * 2.2], true, { fill: INK });
    pt.circle(cx, cy, 2.8, { stroke: INK, sw: W.PROJ, fill: PAPER });
    pt.line(cx - 2.8, cy, cx + 2.8, cy, { stroke: INK, sw: W.THIN });
    pt.text(cx, cy - 0.5, label, { size: 2.0, anchor: 'middle', weight: 600 });
    pt.text(cx, cy + 2.0, sheet, { size: 1.1, anchor: 'middle', font: 'mono' });
  }
}

export function warnBox(pt: Painter, x: number, y: number, w: number, h: number) {
  pt.rect(x - 0.8, y - 0.8, w + 1.6, h + 1.6, { stroke: ACCENT, sw: W.PROJ, dash: [1.2, 0.8] });
}

export function earthHatch(pt: Painter, x0: number, x1: number, y: number, depth: number) {
  pt.begin('earth');
  for (let x = x0; x < x1; x += 1.6) pt.line(x, y + 0.4, Math.min(x1, x + depth), y + depth, { stroke: INK, sw: W.THIN });
  pt.end();
}
