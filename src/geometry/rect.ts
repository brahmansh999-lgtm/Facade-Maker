import type { Vec2, Room } from '../model/types.ts';
import { EPS } from '../model/units.ts';

export interface Rect { x0: number; y0: number; x1: number; y1: number }

export const rectOf = (poly: Vec2[]): Rect => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1 };
};
export const roomRect = (r: Room) => rectOf(r.polygon);
export const polyOf = (r: Rect): Vec2[] => [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]];
export const rw = (r: Rect) => r.x1 - r.x0;
export const rh = (r: Rect) => r.y1 - r.y0;
export const area = (r: Rect) => Math.max(0, rw(r)) * Math.max(0, rh(r));

export function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > EPS && h > EPS ? w * h : 0;
}

export function union(rs: Rect[]): Rect {
  return rs.reduce((acc, r) => ({
    x0: Math.min(acc.x0, r.x0), y0: Math.min(acc.y0, r.y0),
    x1: Math.max(acc.x1, r.x1), y1: Math.max(acc.y1, r.y1),
  }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
}

/** Subtract holes from a rect, returning disjoint rects. Works in any 2D axis pair. */
export function subtract(r: Rect, holes: Rect[]): Rect[] {
  let pieces: Rect[] = [r];
  for (const h of holes) {
    const next: Rect[] = [];
    for (const p of pieces) {
      if (overlap(p, h) <= 0) { next.push(p); continue; }
      const ix0 = Math.max(p.x0, h.x0), ix1 = Math.min(p.x1, h.x1);
      const iy0 = Math.max(p.y0, h.y0), iy1 = Math.min(p.y1, h.y1);
      if (p.y0 < iy0 - EPS) next.push({ x0: p.x0, y0: p.y0, x1: p.x1, y1: iy0 });
      if (iy1 < p.y1 - EPS) next.push({ x0: p.x0, y0: iy1, x1: p.x1, y1: p.y1 });
      if (p.x0 < ix0 - EPS) next.push({ x0: p.x0, y0: iy0, x1: ix0, y1: iy1 });
      if (ix1 < p.x1 - EPS) next.push({ x0: ix1, y0: iy0, x1: p.x1, y1: iy1 });
    }
    pieces = next;
  }
  return pieces.filter((p) => rw(p) > 1e-4 && rh(p) > 1e-4);
}

/** Subtract 1D intervals from [a,b]. */
export function subtract1D(a: number, b: number, holes: [number, number][]): [number, number][] {
  let segs: [number, number][] = [[a, b]];
  for (const [h0, h1] of holes) {
    const next: [number, number][] = [];
    for (const [s0, s1] of segs) {
      if (h1 <= s0 + EPS || h0 >= s1 - EPS) { next.push([s0, s1]); continue; }
      if (h0 > s0 + EPS) next.push([s0, h0]);
      if (h1 < s1 - EPS) next.push([h1, s1]);
    }
    segs = next;
  }
  return segs;
}

export const inside = (r: Rect, x: number, y: number) => x >= r.x0 - EPS && x <= r.x1 + EPS && y >= r.y0 - EPS && y <= r.y1 + EPS;
