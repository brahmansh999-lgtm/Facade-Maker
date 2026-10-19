import type { Brief, StairSpec, Vec2 } from '../model/types.ts';
import type { Rect } from './rect.ts';
import { SLAB } from '../model/units.ts';

export const MAX_RISER = 0.175;
export const MIN_TREAD = 0.25;
export const WAIST = 0.15;

export interface RiserTread { n: number; R: number; T: number; twoRT: number }

/** Riser count from floor-to-floor; tread chosen so 2R+T sits in the middle of 600–640. */
export function riserTread(H: number): RiserTread {
  const n = Math.ceil(H / MAX_RISER - 1e-9);
  const R = H / n;
  let T = Math.round((0.62 - 2 * R) * 100) / 100;
  if (T < MIN_TREAD) T = MIN_TREAD;
  return { n, R, T, twoRT: 2 * R + T };
}

export interface Flight {
  /** t range across the enclosure, s range along it */
  t0: number; t1: number;
  sStart: number;      // s of first riser
  dir: 1 | -1;         // direction of ascent in s
  risers: number;
  zStart: number;      // height above level FFL at start (bottom)
}

export interface Landing { t0: number; t1: number; s0: number; s1: number; z: number }

export interface StairCalc extends RiserTread {
  type: StairSpec['type'];
  rect: Rect;
  axis: 'x' | 'y';
  long: number;
  short: number;
  innerAtMin: boolean;
  width: number;
  landing: number;
  requiredLength: number;
  requiredWidth: number;
  headroom: number;
  pitch: number;
  flights: Flight[];
  landings: Landing[];
  /** s-range of the slab opening above (relative to enclosure start). */
  holeS: [number, number];
  /** convert local (s,t) to plan */
  toPlan: (s: number, t: number) => Vec2;
}

export function sizeStair(type: StairSpec['type'], H: number, available: number) {
  const rt = riserTread(H);
  if (type === 'dogleg') {
    const width = Math.min(1.2, Math.max(0.9, (available - 0.1) / 2));
    const landing = Math.max(width, 1.0);
    const n1 = Math.ceil(rt.n / 2);
    const run = (n1 - 1) * rt.T;
    return { ...rt, width, landing, length: 2 * landing + run, enclosureWidth: 2 * width + 0.1 };
  }
  const width = Math.min(1.2, Math.max(0.9, available));
  const landing = Math.max(width, 1.0);
  const run = (rt.n - 1) * rt.T;
  return { ...rt, width, landing, length: run + landing, enclosureWidth: width };
}

export function computeStair(spec: StairSpec, brief: Brief, innerAtMin = true): StairCalc {
  const p = spec.position;
  const rect: Rect = { x0: p.x, y0: p.y, x1: p.x + p.w, y1: p.y + p.h };
  const axis: 'x' | 'y' = p.h >= p.w ? 'y' : 'x';
  const long = Math.max(p.w, p.h);
  const short = Math.min(p.w, p.h);
  const H = brief.floorToFloor;
  const sz = sizeStair(spec.type, H, short);
  const pitch = Math.atan2(sz.R, sz.T);
  const headroom = H - sz.R - WAIST / Math.cos(pitch);
  const toPlan = (s: number, t: number): Vec2 => (axis === 'y' ? [rect.x0 + t, rect.y0 + s] : [rect.x0 + s, rect.y0 + t]);
  const w = sz.width;
  const inner: [number, number] = innerAtMin ? [0, w] : [short - w, short];
  const outer: [number, number] = innerAtMin ? [short - w, short] : [0, w];
  const flights: Flight[] = [];
  const landings: Landing[] = [];
  let holeS: [number, number];
  if (spec.type === 'dogleg') {
    const n1 = Math.ceil(sz.n / 2);
    const n2 = sz.n - n1;
    const L = sz.landing;
    const run1 = (n1 - 1) * sz.T;
    flights.push({ t0: inner[0], t1: inner[1], sStart: L, dir: 1, risers: n1, zStart: 0 });
    landings.push({ t0: 0, t1: short, s0: L + run1, s1: L + run1 + L, z: n1 * sz.R });
    flights.push({ t0: outer[0], t1: outer[1], sStart: L + run1, dir: -1, risers: n2, zStart: n1 * sz.R });
    holeS = [L, long];
  } else {
    const L = sz.landing;
    flights.push({ t0: inner[0], t1: inner[1], sStart: 0, dir: 1, risers: sz.n, zStart: 0 });
    landings.push({ t0: 0, t1: short, s0: (sz.n - 1) * sz.T, s1: (sz.n - 1) * sz.T + L, z: H });
    // headroom over a straight flight needs the slab open from where pitch line + 2.1 exceeds the soffit
    const sOpen = Math.max(0, ((H - SLAB - 2.1) / sz.R) * sz.T);
    holeS = [Math.min(sOpen, (sz.n - 1) * sz.T), (sz.n - 1) * sz.T];
  }
  return {
    ...sz, type: spec.type, rect, axis, long, short, innerAtMin, width: w, landing: sz.landing,
    requiredLength: sz.length, requiredWidth: sz.enclosureWidth, headroom, pitch, flights, landings, holeS, toPlan,
  };
}
