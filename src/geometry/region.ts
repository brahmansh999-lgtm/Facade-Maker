// Rectilinear regions: the true outline of a storey (L-shapes, notches, cantilevered bays).
// Stored as a filled cell grid over the unique edge coordinates of its rectangles.
import type { Vec2 } from '../model/types.ts';
import type { Rect } from './rect.ts';

const Q = 1e4;
const q = (v: number) => Math.round(v * Q) / Q;
const uniq = (vs: number[]) => [...new Set(vs.map(q))].sort((a, b) => a - b);

export class Region {
  readonly xs: number[];
  readonly ys: number[];
  private readonly fill: boolean[][];
  private constructor(xs: number[], ys: number[], fill: boolean[][]) { this.xs = xs; this.ys = ys; this.fill = fill; }

  static of(rects: Rect[]): Region {
    const rs = rects.filter((r) => r.x1 - r.x0 > 1e-4 && r.y1 - r.y0 > 1e-4);
    const xs = uniq(rs.flatMap((r) => [r.x0, r.x1])), ys = uniq(rs.flatMap((r) => [r.y0, r.y1]));
    const fill = ys.slice(1).map((_, j) => xs.slice(1).map((_, i) => {
      const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
      return rs.some((r) => cx > r.x0 && cx < r.x1 && cy > r.y0 && cy < r.y1);
    }));
    return new Region(xs, ys, fill);
  }

  get empty() { return !this.fill.some((row) => row.some(Boolean)); }

  contains(x: number, y: number): boolean {
    const i = this.xs.findIndex((v, k) => k < this.xs.length - 1 && x > v && x < this.xs[k + 1]);
    const j = this.ys.findIndex((v, k) => k < this.ys.length - 1 && y > v && y < this.ys[k + 1]);
    return i >= 0 && j >= 0 && this.fill[j][i];
  }

  private static combine(a: Region, b: Region, op: (p: boolean, q: boolean) => boolean): Region {
    const xs = uniq([...a.xs, ...b.xs]), ys = uniq([...a.ys, ...b.ys]);
    const fill = ys.slice(1).map((_, j) => xs.slice(1).map((_, i) => {
      const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
      return op(a.contains(cx, cy), b.contains(cx, cy));
    }));
    return new Region(xs, ys, fill);
  }
  union(b: Region) { return Region.combine(this, b, (p, q) => p || q); }
  minus(b: Region) { return Region.combine(this, b, (p, q) => p && !q); }
  and(b: Region) { return Region.combine(this, b, (p, q) => p && q); }

  /** disjoint rectangles: maximal runs per row, stacked where rows repeat */
  rects(): Rect[] {
    const out: Rect[] = [];
    let open = new Map<string, Rect>();
    for (let j = 0; j < this.ys.length - 1; j++) {
      const next = new Map<string, Rect>();
      for (let i = 0; i < this.xs.length - 1; i++) {
        if (!this.fill[j][i]) continue;
        let k = i;
        while (k + 1 < this.xs.length - 1 && this.fill[j][k + 1]) k++;
        const key = `${i}:${k}`;
        const prev = open.get(key);
        if (prev) { prev.y1 = this.ys[j + 1]; next.set(key, prev); open.delete(key); }
        else next.set(key, { x0: this.xs[i], x1: this.xs[k + 1], y0: this.ys[j], y1: this.ys[j + 1] });
        i = k;
      }
      out.push(...open.values());
      open = next;
    }
    out.push(...open.values());
    return out;
  }

  area() { return this.rects().reduce((s, r) => s + (r.x1 - r.x0) * (r.y1 - r.y0), 0); }

  bbox(): Rect {
    const rs = this.rects();
    return rs.reduce((a, r) => ({ x0: Math.min(a.x0, r.x0), y0: Math.min(a.y0, r.y0), x1: Math.max(a.x1, r.x1), y1: Math.max(a.y1, r.y1) }),
      { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  }

  /** grow (d > 0) by a square: exact for rectilinear regions */
  inflate(d: number): Region {
    return Region.of(this.rects().map((r) => ({ x0: r.x0 - d, y0: r.y0 - d, x1: r.x1 + d, y1: r.y1 + d })));
  }
  erode(d: number): Region {
    const b = this.bbox();
    const comp = Region.of([{ x0: b.x0 - 2 * d - 1, y0: b.y0 - 2 * d - 1, x1: b.x1 + 2 * d + 1, y1: b.y1 + 2 * d + 1 }]).minus(this);
    return this.minus(comp.inflate(d));
  }

  /**
   * Boundary loops with the region on the left: outer loops run counter-clockwise, holes
   * clockwise. Collinear points are dropped.
   */
  loops(): Vec2[][] {
    const nx = this.xs.length - 1, ny = this.ys.length - 1;
    const at = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny && this.fill[j][i];
    const next = new Map<string, [number, number][]>();
    const add = (a: [number, number], b: [number, number]) => {
      const k = `${a[0]},${a[1]}`;
      if (!next.has(k)) next.set(k, []);
      next.get(k)!.push(b);
    };
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (!at(i, j)) continue;
      if (!at(i, j - 1)) add([i, j], [i + 1, j]);
      if (!at(i + 1, j)) add([i + 1, j], [i + 1, j + 1]);
      if (!at(i, j + 1)) add([i + 1, j + 1], [i, j + 1]);
      if (!at(i - 1, j)) add([i, j + 1], [i, j]);
    }
    const loops: Vec2[][] = [];
    for (const k0 of [...next.keys()]) {
      while (next.get(k0)!.length) {
        const idx: [number, number][] = [];
        let k = k0;
        do {
          idx.push(k.split(',').map(Number) as [number, number]);
          const nb = next.get(k)!.shift()!;
          k = `${nb[0]},${nb[1]}`;
        } while (k !== k0 && next.get(k)?.length);
        const pts = idx.map(([i, j]) => [this.xs[i], this.ys[j]] as Vec2);
        const clean = pts.filter((p, n) => {
          const a = pts[(n - 1 + pts.length) % pts.length], b = pts[(n + 1) % pts.length];
          return !((a[0] === p[0] && p[0] === b[0]) || (a[1] === p[1] && p[1] === b[1]));
        });
        if (clean.length >= 4) loops.push(clean);
      }
    }
    return loops;
  }
}

export const signedArea = (loop: Vec2[]) => loop.reduce((s, p, i) => {
  const b = loop[(i + 1) % loop.length];
  return s + (p[0] * b[1] - b[0] * p[1]);
}, 0) / 2;

/** loop edges with their outward normal (region on the left of a → b) */
export function loopEdges(loop: Vec2[]): { a: Vec2; b: Vec2; n: Vec2 }[] {
  return loop.map((a, i) => {
    const b = loop[(i + 1) % loop.length];
    const dx = Math.sign(b[0] - a[0]), dy = Math.sign(b[1] - a[1]);
    return { a, b, n: [dy, -dx] as Vec2 };
  });
}

/** group loops into outers with their holes, for triangulation */
export function shapes(loops: Vec2[][]): { outer: Vec2[]; holes: Vec2[][] }[] {
  const outers = loops.filter((l) => signedArea(l) > 0).map((outer) => ({ outer, holes: [] as Vec2[][] }));
  for (const h of loops.filter((l) => signedArea(l) < 0)) {
    // the region lies on the left of a hole edge, i.e. inside its outer loop
    const [px, py] = [(h[0][0] + h[1][0]) / 2, (h[0][1] + h[1][1]) / 2];
    const host = outers.find((o) => pointIn(o.outer, px - 1e-3 * Math.sign(h[1][1] - h[0][1]), py + 1e-3 * Math.sign(h[1][0] - h[0][0])));
    (host ?? outers[0])?.holes.push(h);
  }
  return outers;
}

export function pointIn(poly: Vec2[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
