// Site works: boundary wall with gates, car bays, paths and porch paving, the rear verandah,
// and the garden (front and side lawns, backyard with a sit-out, planting bed and trees).
import type { Project } from '../model/types.ts';
import type { Opening } from './openings.ts';
import { EXT_WALL, SLAB } from '../model/units.ts';
import { loopEdges, Region } from './region.ts';
import type { Rect } from './rect.ts';

export const BWALL = 0.23;

export interface Verandah {
  /** raised deck at plinth level */
  deck: Rect;
  steps: Rect;
  nSteps: number;
  cols: { x: number; y: number; s: number }[];
  /** canopy plan (from the wall out past the columns) and its underside / top */
  canopy: Rect;
  zc0: number;
  zc1: number;
}

export interface SiteWorks {
  walls: { r: Rect; h: number }[];
  gates: (Rect & { kind: 'car' | 'foot' })[];
  bays: Rect[];
  paving: Region;
  lawn: Region;
  beds: Rect[];
  patio: Rect | null;
  trees: { x: number; y: number; r: number }[];
  verandah: Verandah | null;
  /** clear depth of the backyard behind the house (or its verandah) */
  yardDepth: number;
}

export function parkingBays(p: Project, ent: Opening | undefined): Rect[] {
  const s = p.site, sb = s.setbacks, n = p.brief.parking;
  const bayW = 2.7, y0 = BWALL + 0.1, bayD = Math.min(5.0, sb.front - y0 - 0.2);
  if (n <= 0 || bayD < 3) return [];
  let x = s.width - sb.right - 0.2 - n * bayW;
  const avoid = ent ? ent.center : -99;
  if (avoid > x - 0.8 && avoid < s.width - sb.right) x = sb.left + 0.2;
  return Array.from({ length: n }, (_, i) => ({ x0: x + i * bayW, x1: x + (i + 1) * bayW, y0, y1: y0 + bayD }));
}

/** the verandah deck along the ground floor's rear-most wall, if the yard leaves room for it */
export function verandahDeck(p: Project, g0: Region): Rect | null {
  const d = p.works?.verandah ?? 0;
  if (d <= 0.6 || g0.empty) return null;
  const bb = g0.bbox();
  const rear = g0.loops().flatMap(loopEdges).filter((e) => e.n[1] === 1 && Math.abs(e.a[1] - bb.y1) < 1e-3);
  if (!rear.length) return null;
  const depth = Math.min(d, p.site.depth - BWALL - bb.y1 - 1.5);
  if (depth <= 0.6) return null;
  return { x0: Math.min(...rear.flatMap((e) => [e.a[0], e.b[0]])), x1: Math.max(...rear.flatMap((e) => [e.a[0], e.b[0]])), y0: bb.y1, y1: bb.y1 + depth };
}

export function siteWorks(p: Project, regions: Region[], ent: Opening | undefined, gardenDoor: Opening | undefined): SiteWorks {
  const s = p.site, w = p.works;
  const W = s.width, D = s.depth, t = BWALL;
  const g0 = regions[0];
  const bays = parkingBays(p, ent);

  // ---- verandah on the ground floor's rear edge
  let verandah: Verandah | null = null;
  const bb0 = g0.bbox();
  const deck = verandahDeck(p, g0);
  if (deck) {
    const { x0, x1 } = deck;
    const nSteps = Math.max(1, Math.round(p.brief.plinth / 0.15));
    const sc = gardenDoor ? Math.min(x1 - 1.0, Math.max(x0 + 1.0, gardenDoor.center)) : (x0 + x1) / 2;
    const steps = { x0: sc - 0.9, x1: sc + 0.9, y0: deck.y1, y1: deck.y1 + nSteps * 0.3 };
    const cs = 0.2, n = Math.max(2, Math.ceil((x1 - x0) / 4.5) + 1);
    const cols: Verandah['cols'] = [];
    for (let k = 0; k < n; k++) {
      let x = x0 + cs / 2 + 0.05 + ((x1 - x0 - cs - 0.1) * k) / (n - 1);
      if (x > steps.x0 - cs && x < steps.x1 + cs) x = x - steps.x0 < steps.x1 - x ? steps.x0 - cs : steps.x1 + cs;
      if (x > x0 && x < x1 && !cols.some((c) => Math.abs(c.x - x) < 0.8)) cols.push({ x, y: deck.y1 - cs / 2 - 0.05, s: cs });
    }
    const zTop = (p.levels[1]?.elevation ?? p.brief.plinth + p.levels.length * p.brief.floorToFloor) - SLAB - 0.35;
    verandah = { deck, steps, nSteps, cols, canopy: { x0: x0 - 0.1, x1: x1 + 0.1, y0: bb0.y1, y1: deck.y1 + 0.15 }, zc0: zTop - 0.2, zc1: zTop };
  }

  // ---- boundary wall with a car gate and a pedestrian gate on the front
  const walls: SiteWorks['walls'] = [];
  const gates: SiteWorks['gates'] = [];
  if (w.wall > 0) {
    const front = Math.min(w.wall, 1.2);
    const holes: [number, number, 'car' | 'foot'][] = [];
    if (bays.length) holes.push([Math.min(...bays.map((b) => b.x0)) + 0.1, Math.max(...bays.map((b) => b.x1)) - 0.1, 'car']);
    if (ent) {
      // a pedestrian gate on the entrance path, slid clear of the car gate with a pier between
      let a = ent.center - 0.6, b = ent.center + 0.6;
      const car = holes.find(([h0, h1]) => b > h0 - 0.5 && a < h1 + 0.5);
      if (car) { if (ent.center < (car[0] + car[1]) / 2) { b = car[0] - 0.5; a = b - 1.2; } else { a = car[1] + 0.5; b = a + 1.2; } }
      if (a > t + 0.3 && b < W - t - 0.3) holes.push([a, b, 'foot']);
    }
    holes.sort((a, b) => a[0] - b[0]);
    let x = 0;
    for (const [a, b, kind] of holes) {
      if (a - x > 0.05) walls.push({ r: { x0: x, x1: a, y0: 0, y1: t }, h: front });
      gates.push({ x0: a, x1: b, y0: 0, y1: t, kind });
      x = b;
    }
    if (W - x > 0.05) walls.push({ r: { x0: x, x1: W, y0: 0, y1: t }, h: front });
    walls.push({ r: { x0: 0, x1: t, y0: t, y1: D }, h: w.wall });
    walls.push({ r: { x0: W - t, x1: W, y0: t, y1: D }, h: w.wall });
    walls.push({ r: { x0: t, x1: W - t, y0: D - t, y1: D }, h: w.wall });
  }

  // ---- hard landscape: car bays, entrance path, covered porch, backyard path and sit-out
  const pave: Rect[] = [...bays];
  if (ent && ent.side === 'front') pave.push({ x0: ent.center - 0.6, x1: ent.center + 0.6, y0: t, y1: ent.c - EXT_WALL / 2 });
  const covered = regions.slice(1).reduce((u, r) => u.union(r), Region.of([])).minus(g0);
  let patio: Rect | null = null;
  const beds: Rect[] = [];
  const back = verandah ? verandah.steps.y1 : bb0.y1;
  const yardDepth = D - t - back;
  if (w.garden) {
    if (yardDepth > 4) {
      beds.push({ x0: t, x1: W - t, y0: D - t - 0.8, y1: D - t });
      const pc = verandah ? (verandah.steps.x0 + verandah.steps.x1) / 2 : (bb0.x0 + bb0.x1) / 2;
      const pw = Math.min(3.6, W - 2 * t - 1), pd = Math.min(2.7, yardDepth - 2.4);
      const px = Math.max(t + 0.4, Math.min(W - t - 0.4 - pw, pc - pw / 2));
      patio = { x0: px, x1: px + pw, y0: D - t - 0.8 - 0.6 - pd, y1: D - t - 0.8 - 0.6 };
      if (patio.y0 - back > 0.3) pave.push({ x0: pc - 0.5, x1: pc + 0.5, y0: back, y1: patio.y0 });
      pave.push(patio);
    }
  }
  const paving = Region.of(pave).union(covered);
  const inner = Region.of([{ x0: t, x1: W - t, y0: t, y1: D - t }]);
  const built = g0.union(Region.of(verandah ? [verandah.deck, verandah.steps] : []));
  const lawn = w.garden ? inner.minus(built).minus(paving).minus(Region.of(beds)) : Region.of([]);

  // ---- trees: a row in the rear bed clear of the sit-out, one in the front lawn
  const trees: SiteWorks['trees'] = [];
  if (w.garden) {
    if (beds.length) {
      const y = D - t - 1.3, r = 1.3;
      for (let x = t + 1.6; x < W - t - 1.4; x += 3.6) {
        if (patio && x > patio.x0 - r && x < patio.x1 + r) continue;
        trees.push({ x, y, r });
      }
    }
    const fy = Math.min(s.setbacks.front - 1.6, 2.2);
    for (const fx of [t + 1.8, W - t - 1.8]) {
      if (fy > 1.2 && lawn.contains(fx, fy) && lawn.contains(fx - 0.9, fy - 0.9) && lawn.contains(fx + 0.9, fy + 0.9)) { trees.push({ x: fx, y: fy, r: 1.1 }); break; }
    }
  }
  return { walls, gates, bays, paving, lawn, beds, patio, trees, verandah, yardDepth };
}
