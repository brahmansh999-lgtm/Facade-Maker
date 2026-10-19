// Furniture layout per room: each piece backs onto a wall, keeps clear of door swings and
// (if tall) of windows, and leaves its use zone free. Pure data — drawn in plan and blocked in 3D.
import type { Room } from '../model/types.ts';
import type { Opening } from './openings.ts';
import { overlap, roomRect, type Rect } from './rect.ts';

export type WallSide = 'x0' | 'x1' | 'y0' | 'y1';
export type FurnKind =
  | 'bed' | 'bedside' | 'wardrobe' | 'sofa' | 'armchair' | 'coffee' | 'tv' | 'rug' | 'table' | 'chair'
  | 'counter' | 'worktop' | 'fridge' | 'desk' | 'shelf' | 'wc' | 'basin' | 'shower' | 'washer' | 'console' | 'plant';

export interface Furn {
  kind: FurnKind;
  r: Rect;
  /** the wall it backs onto: fixes the piece's orientation */
  side: WallSide;
  /** height for the 3D block (m) */
  h: number;
}

const SIDES: WallSide[] = ['y0', 'y1', 'x0', 'x1'];
const OPP: Record<WallSide, WallSide> = { x0: 'x1', x1: 'x0', y0: 'y1', y1: 'y0' };
const DOORISH = new Set(['door', 'entrance', 'garden', 'opening']);

class Placer {
  items: Furn[] = [];
  blocks: Rect[] = [];
  tall: Rect[] = [];
  doorSides = new Set<WallSide>();
  windowSides = new Set<WallSide>();
  readonly c: Rect;
  constructor(c: Rect) { this.c = c; }

  along(s: WallSide): [number, number] { return s[0] === 'y' ? [this.c.x0, this.c.x1] : [this.c.y0, this.c.y1]; }
  len(s: WallSide) { const [a, b] = this.along(s); return b - a; }
  /** rect of a piece on wall s starting at a, len long, depth deep, off from the wall */
  rect(s: WallSide, a: number, len: number, depth: number, off = 0): Rect {
    const c = this.c;
    switch (s) {
      case 'y0': return { x0: a, x1: a + len, y0: c.y0 + off, y1: c.y0 + off + depth };
      case 'y1': return { x0: a, x1: a + len, y0: c.y1 - off - depth, y1: c.y1 - off };
      case 'x0': return { x0: c.x0 + off, x1: c.x0 + off + depth, y0: a, y1: a + len };
      case 'x1': return { x0: c.x1 - off - depth, x1: c.x1 - off, y0: a, y1: a + len };
    }
  }
  free(r: Rect, tall: boolean) {
    const c = this.c, e = 1e-6;
    if (r.x0 < c.x0 - e || r.x1 > c.x1 + e || r.y0 < c.y0 - e || r.y1 > c.y1 + e) return false;
    const g = { x0: r.x0 + 0.01, x1: r.x1 - 0.01, y0: r.y0 + 0.01, y1: r.y1 - 0.01 };
    if (this.blocks.some((b) => overlap(b, g) > 0)) return false;
    if (this.items.some((it) => it.kind !== 'rug' && overlap(it.r, g) > 0)) return false;
    return !(tall && this.tall.some((b) => overlap(b, g) > 0));
  }
  /**
   * Put a piece on wall s. With `at` it is tried there only; otherwise it slides from the centre
   * (or `near`) outward. `zone` is extra depth in front that must stay free (use space).
   */
  place(kind: FurnKind, s: WallSide, len: number, depth: number, h: number, o: { at?: number; near?: number; off?: number; zone?: number } = {}): Furn | null {
    const [lo, hi] = this.along(s);
    if (hi - lo < len - 1e-6) return null;
    const off = o.off ?? 0, zone = o.zone ?? 0, tall = h > 1.0;
    const tryAt = (a: number) => {
      if (a < lo - 1e-6 || a + len > hi + 1e-6) return null;
      const r = this.rect(s, a, len, depth, off);
      if (!this.free(r, tall)) return null;
      if (zone > 0) {
        // the use zone may stop at the room edge but not run through furniture or door swings
        const z = this.rect(s, a, len, zone, off + depth);
        const cz = { x0: Math.max(z.x0, this.c.x0), x1: Math.min(z.x1, this.c.x1), y0: Math.max(z.y0, this.c.y0), y1: Math.min(z.y1, this.c.y1) };
        if (cz.x1 - cz.x0 < 0.3 || cz.y1 - cz.y0 < 0.3 || !this.free(cz, false)) return null;
      }
      return r;
    };
    let r: Rect | null = null;
    if (o.at !== undefined) r = tryAt(o.at);
    else {
      const mid = Math.min(hi - len, Math.max(lo, (o.near ?? (lo + hi) / 2) - len / 2));
      for (let k = 0; !r && Math.ceil(k / 2) * 0.05 <= hi - lo; k++) {
        const a = mid + Math.ceil(k / 2) * 0.05 * (k % 2 ? 1 : -1);
        if (a >= lo - 1e-6 && a + len <= hi + 1e-6) r = tryAt(a);
      }
    }
    if (!r) return null;
    const f: Furn = { kind, r, side: s, h };
    this.items.push(f);
    return f;
  }
  /** first wall (in preference order) the piece fits on */
  any(kind: FurnKind, sides: WallSide[], len: number, depth: number, h: number, o: { zone?: number; off?: number } = {}) {
    for (const s of sides) { const f = this.place(kind, s, len, depth, h, o); if (f) return f; }
    return null;
  }
  /** walls ranked: no door first, no window (if asked), then longest */
  ranked(avoidWindow: boolean, exclude: WallSide[] = []) {
    return SIDES.filter((s) => !exclude.includes(s)).sort((a, b) =>
      (+this.doorSides.has(a) - +this.doorSides.has(b)) * 10 +
      (avoidWindow ? (+this.windowSides.has(a) - +this.windowSides.has(b)) * 3 : 0) +
      (this.len(b) - this.len(a)) * 0.5);
  }
  startOf(f: Furn) { return f.side[0] === 'y' ? f.r.x0 : f.r.y0; }
  lenOf(f: Furn) { return f.side[0] === 'y' ? f.r.x1 - f.r.x0 : f.r.y1 - f.r.y0; }
  depthOf(f: Furn) { return f.side[0] === 'y' ? f.r.y1 - f.r.y0 : f.r.x1 - f.r.x0; }
}

function sideOf(b: Rect, op: Opening): WallSide | null {
  const t = 0.02;
  if (op.run === 'x') {
    if (op.center < b.x0 - t || op.center > b.x1 + t) return null;
    if (Math.abs(op.c - b.y0) < t) return 'y0';
    if (Math.abs(op.c - b.y1) < t) return 'y1';
  } else {
    if (op.center < b.y0 - t || op.center > b.y1 + t) return null;
    if (Math.abs(op.c - b.x0) < t) return 'x0';
    if (Math.abs(op.c - b.x1) < t) return 'x1';
  }
  return null;
}

export function furnishRoom(room: Room, clear: Rect, openings: Opening[]): Furn[] {
  const P = new Placer(clear);
  const b = roomRect(room);
  for (const op of openings) {
    if (op.roomId !== room.id && op.otherRoomId !== room.id) continue;
    const s = sideOf(b, op);
    if (!s) continue;
    const a = op.center - op.width / 2, len = op.width;
    if (DOORISH.has(op.kind)) {
      P.doorSides.add(s);
      // a leaf needs its swing; a plain opening only a walkway through it
      const depth = op.kind === 'opening' ? 0.9 : Math.min(1.25, Math.max(0.95, op.width / Math.max(1, op.leaves) + 0.15));
      P.blocks.push(P.rect(s, a - 0.1, len + 0.2, depth));
    } else {
      P.windowSides.add(s);
      P.tall.push(P.rect(s, a - 0.05, len + 0.1, 0.7));
    }
  }
  const W = clear.x1 - clear.x0, H = clear.y1 - clear.y0, short = Math.min(W, H), A = W * H;
  const longSides: WallSide[] = W >= H ? ['y0', 'y1'] : ['x0', 'x1'];

  switch (room.type) {
    case 'bedroom': {
      const bw = short >= 3.3 ? 1.8 : short >= 2.9 ? 1.5 : short >= 2.5 ? 1.2 : 0.9;
      const bed = P.any('bed', P.ranked(true), bw, 2.0, 0.5, { zone: 0.6 });
      if (bed) {
        const a = P.startOf(bed);
        P.place('bedside', bed.side, 0.45, 0.4, 0.5, { at: a - 0.5 });
        P.place('bedside', bed.side, 0.45, 0.4, 0.5, { at: a + bw + 0.05 });
      }
      const others = P.ranked(true, bed ? [bed.side] : []);
      for (const L of [2.4, 2.0, 1.6, 1.2]) if (P.any('wardrobe', others, L, 0.6, 2.1, { zone: 0.7 })) break;
      if (A > 13) P.any('desk', P.ranked(false, bed ? [bed.side] : []).sort((x, y) => +P.windowSides.has(y) - +P.windowSides.has(x)), 1.2, 0.55, 0.75, { zone: 0.6 });
      break;
    }
    case 'living': case 'family': {
      const sl = Math.min(2.6, Math.max(1.6, P.len(longSides[0]) * 0.55));
      const sofa = P.any('sofa', P.ranked(false).sort((x, y) => +longSides.includes(y as never) - +longSides.includes(x as never) || +P.doorSides.has(x) - +P.doorSides.has(y)), sl, 0.9, 0.8, { zone: 1.5 });
      if (sofa) {
        const mid = P.startOf(sofa) + sl / 2;
        const ct = P.place('coffee', sofa.side, 1.1, 0.55, 0.4, { at: mid - 0.55, off: 1.3 });
        if (ct) P.items.unshift({ kind: 'rug', r: P.rect(sofa.side, mid - 1.3, 2.6, 1.9, 0.75), side: sofa.side, h: 0.01 });
        P.place('tv', OPP[sofa.side], 1.8, 0.4, 0.5, { near: mid }) ?? P.place('tv', OPP[sofa.side], 1.2, 0.4, 0.5, { near: mid });
        P.place('armchair', sofa.side, 0.8, 0.8, 0.8, { at: P.startOf(sofa) - 0.95, off: 0.9 }) ?? P.place('armchair', sofa.side, 0.8, 0.8, 0.8, { at: P.startOf(sofa) + sl + 0.15, off: 0.9 });
      }
      if (A > 22) P.any('plant', P.ranked(false), 0.5, 0.5, 1.2);
      break;
    }
    case 'dining': {
      const seats6 = Math.max(W, H) >= 3.4 && short >= 2.6;
      const tl = seats6 ? 1.8 : 1.2, td = seats6 ? 0.9 : 0.8;
      const horiz = W >= H;
      const cx = (clear.x0 + clear.x1) / 2, cy = (clear.y0 + clear.y1) / 2;
      const zone = (x: number, y: number): Rect => horiz
        ? { x0: x - tl / 2 - 0.55, x1: x + tl / 2 + 0.55, y0: y - td / 2 - 0.6, y1: y + td / 2 + 0.6 }
        : { x0: x - td / 2 - 0.6, x1: x + td / 2 + 0.6, y0: y - tl / 2 - 0.55, y1: y + tl / 2 + 0.55 };
      let at: [number, number] | null = null;
      for (let k = 0; k < 120 && !at; k++) {
        const dx = ((k % 11) - 5) * 0.1, dy = (Math.floor(k / 11) - 5) * 0.1;
        if (P.free(zone(cx + dx, cy + dy), false)) at = [cx + dx, cy + dy];
      }
      if (at) {
        const [x, y] = at;
        const t: Rect = horiz ? { x0: x - tl / 2, x1: x + tl / 2, y0: y - td / 2, y1: y + td / 2 } : { x0: x - td / 2, x1: x + td / 2, y0: y - tl / 2, y1: y + tl / 2 };
        P.items.push({ kind: 'table', r: t, side: horiz ? 'y0' : 'x0', h: 0.75 });
        const n = seats6 ? 3 : 2;
        for (let i = 0; i < n; i++) {
          const s = -tl / 2 + (tl * (i + 0.5)) / n;
          if (horiz) {
            P.items.push({ kind: 'chair', r: { x0: x + s - 0.22, x1: x + s + 0.22, y0: t.y0 - 0.5, y1: t.y0 - 0.05 }, side: 'y0', h: 0.45 });
            P.items.push({ kind: 'chair', r: { x0: x + s - 0.22, x1: x + s + 0.22, y0: t.y1 + 0.05, y1: t.y1 + 0.5 }, side: 'y1', h: 0.45 });
          } else {
            P.items.push({ kind: 'chair', r: { x0: t.x0 - 0.5, x1: t.x0 - 0.05, y0: y + s - 0.22, y1: y + s + 0.22 }, side: 'x0', h: 0.45 });
            P.items.push({ kind: 'chair', r: { x0: t.x1 + 0.05, x1: t.x1 + 0.5, y0: y + s - 0.22, y1: y + s + 0.22 }, side: 'x1', h: 0.45 });
          }
        }
      }
      P.any('console', P.ranked(false), 1.6, 0.45, 0.85);
      break;
    }
    case 'kitchen': {
      let main: Furn | null = null;
      for (const s of P.ranked(false)) {
        for (let L = Math.floor(P.len(s) * 20) / 20; L >= 1.5 && !main; L -= 0.3) main = P.place('counter', s, L, 0.6, 0.9, { zone: 0.9 });
        if (main) break;
      }
      if (main) {
        const adj = (main.side[0] === 'y' ? ['x0', 'x1'] : ['y0', 'y1']) as WallSide[];
        let ret: Furn | null = null;
        for (const s of adj.sort((a, c) => +P.doorSides.has(a) - +P.doorSides.has(c))) {
          for (let L = Math.floor((P.len(s) - 0.6) * 20) / 20; L >= 1.2 && !ret; L -= 0.3) ret = P.place('worktop', s, L, 0.6, 0.9, { zone: 0.9 });
          if (ret) break;
        }
      }
      P.any('fridge', P.ranked(false), 0.75, 0.7, 1.9, { zone: 0.8 });
      break;
    }
    case 'study': {
      const desk = P.any('desk', P.ranked(false).sort((x, y) => +P.windowSides.has(y) - +P.windowSides.has(x) || +P.doorSides.has(x) - +P.doorSides.has(y)), Math.min(1.6, short - 0.2), 0.6, 0.75, { zone: 0.8 });
      P.any('shelf', P.ranked(true, desk ? [desk.side] : []), Math.min(1.8, Math.max(W, H) - 0.4), 0.35, 2.0, { zone: 0.6 });
      if (A > 9) P.any('armchair', P.ranked(false), 0.8, 0.8, 0.8);
      break;
    }
    case 'bath': case 'wc': {
      const quiet = P.ranked(false);
      if (room.type === 'bath' && A >= 3.2) {
        for (const s of quiet) {
          const [lo, hi] = P.along(s);
          if (P.place('shower', s, 0.9, 0.9, 0.05, { at: lo }) || P.place('shower', s, 0.9, 0.9, 0.05, { at: hi - 0.9 })) break;
        }
      }
      P.any('wc', quiet, 0.45, 0.7, 0.4, { zone: 0.5 });
      P.any('basin', quiet, 0.55, 0.45, 0.85, { zone: 0.5 });
      break;
    }
    case 'utility': {
      P.any('washer', P.ranked(false), 0.6, 0.6, 0.85, { zone: 0.7 });
      P.any('worktop', P.ranked(false), Math.min(1.2, Math.max(W, H) - 0.7), 0.6, 0.9, { zone: 0.7 });
      break;
    }
    case 'foyer': {
      P.any('console', P.ranked(false), Math.min(1.4, Math.max(W, H) - 0.4), 0.4, 0.85, { zone: 0.6 });
      break;
    }
    case 'store': {
      for (const s of P.ranked(false).slice(0, 2)) P.place('shelf', s, Math.max(0.6, P.len(s) - 0.1), 0.45, 2.0, { zone: 0.6 });
      break;
    }
    default: break;
  }
  return P.items;
}
