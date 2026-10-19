import type { ParamSet } from '../model/types.ts';
import { lerp, r3, rng, SLAB } from '../model/units.ts';
import { subtract, subtract1D, overlap, type Rect } from '../geometry/rect.ts';
import type { Face, FaceLevel, FaceOpening, FacadeOutput, FacadeType, Orientation, Palette, ParamDef, Prim, ScheduleRow } from './types.ts';
import { buildPrimGroup } from '../three/primMeshes.ts';
import { primsToSVG } from '../drawings/primDraw.ts';

/** depth of the slab-edge + beam band read on the elevation */
export const BAND = 0.3;

export interface Storey { index: number; z0: number; z1: number }
export interface Band { z0: number; z1: number; kind: 'plinth' | 'floor' | 'roof' | 'parapet' }

export function storeysOf(face: Face): Storey[] {
  const out: Storey[] = [];
  face.levels.forEach((l, i) => {
    const next = i + 1 < face.levels.length ? face.levels[i + 1].ffl : face.roofZ;
    out.push({ index: l.index, z0: l.ffl, z1: next - BAND });
  });
  return out;
}

export function bandsOf(face: Face): Band[] {
  const b: Band[] = [{ z0: face.groundZ, z1: face.plinthTop, kind: 'plinth' }];
  face.levels.slice(1).forEach((l) => b.push({ z0: l.ffl - BAND, z1: l.ffl, kind: 'floor' }));
  b.push({ z0: face.roofZ - BAND, z1: face.roofZ, kind: 'roof' });
  b.push({ z0: face.roofZ, z1: face.parapetTop, kind: 'parapet' });
  return b;
}

export const def = (p: Omit<ParamDef, 'kind'> & { kind?: ParamDef['kind'] }): ParamDef => ({ kind: 'range', ...p });

export class Ctx {
  prims: Prim[] = [];
  notes: string[] = [];
  private rows = new Map<string, ScheduleRow>();
  readonly storeys: Storey[];
  readonly bands: Band[];
  readonly bays: [number, number][];
  readonly lines: number[];
  readonly face: Face;
  readonly openings: FaceOpening[];
  readonly levels: FaceLevel[];
  readonly orient: Orientation;
  readonly palette: Palette;
  private params: ParamSet;
  private defs: ParamDef[];

  constructor(type: Pick<FacadeType, 'params'>, face: Face, openings: FaceOpening[], levels: FaceLevel[], orient: Orientation, params: ParamSet, palette: Palette) {
    this.face = face; this.openings = openings; this.levels = levels; this.orient = orient; this.palette = palette;
    this.params = params; this.defs = type.params;
    this.storeys = storeysOf(face);
    this.bands = bandsOf(face);
    const inner = face.gridU.map((g) => g.u).filter((u) => u > 0.2 && u < face.width - 0.2);
    this.lines = [0, ...inner, face.width];
    this.bays = this.lines.slice(1).map((u, i) => [this.lines[i], u]);
  }

  get width() { return this.face.width; }
  get bottom() { return this.face.plinthTop; }
  get top() { return this.face.parapetTop; }

  raw(key: string) {
    const v = this.params[key];
    return v === undefined ? this.defs.find((d) => d.key === key)?.default : v;
  }
  num(key: string) { return Number(this.raw(key)); }
  /** millimetre param in metres */
  m(key: string) { return this.num(key) / 1000; }
  pct(key: string) { return this.num(key) / 100; }
  str(key: string) { return String(this.raw(key)); }
  bool(key: string) { return Boolean(this.raw(key)); }

  /** climate response factor: lerp(lo,hi) by exposure when climate response is on */
  clim(lo: number, hi: number) { return this.orient.climate ? lerp(lo, hi, this.orient.exposure) : 1; }

  openRects(margin = 0): Rect[] {
    return this.openings.map((o) => ({ x0: o.u0 - margin, x1: o.u1 + margin, y0: o.z0 - margin, y1: o.z1 + margin }));
  }
  /** porosity a screen over rect r must provide; >1 means a door is behind it (must stay clear) */
  req(r: Rect): number {
    let need = 0;
    for (const o of this.openings) {
      const or = { x0: o.u0, x1: o.u1, y0: o.z0, y1: o.z1 };
      if (overlap(r, or) > 1e-4) need = Math.max(need, o.door ? 2 : o.reqRatio);
    }
    return need;
  }
  doorRects(margin = 0.05): Rect[] {
    return this.openings.filter((o) => o.door).map((o) => ({ x0: o.u0 - margin, x1: o.u1 + margin, y0: o.z0 - 1, y1: o.z1 + margin }));
  }
  /** rect pieces of r clear of every opening (+margin) — for solid elements */
  solid(r: Rect, margin = 0.05): Rect[] { return subtract(r, this.openRects(margin)); }
  /** rect pieces of r clear of doors only — for screens */
  clearDoors(r: Rect, margin = 0.1): Rect[] { return subtract(r, this.doorRects(margin)); }

  /** z datums that coursing should honour: plinth, floors, sills, heads, roof, parapet */
  datums(): number[] {
    const z = new Set<number>([r3(this.bottom), r3(this.top), r3(this.face.roofZ)]);
    for (const b of this.bands) { z.add(r3(b.z0)); z.add(r3(b.z1)); }
    for (const o of this.openings) { z.add(r3(o.z0)); z.add(r3(o.z1)); }
    return [...z].filter((v) => v >= this.bottom - 1e-6 && v <= this.top + 1e-6).sort((a, b) => a - b);
  }

  add(p: Prim) { this.prims.push(p); return p; }
  row(element: string, size: string, material: string, count: number, area: number, unit: ScheduleRow['unit'] = 'nr') {
    const k = `${element}|${size}|${material}|${unit}`;
    const r = this.rows.get(k);
    if (r) { r.count += count; r.area += area; }
    else this.rows.set(k, { element, size, material, count, area, unit });
  }

  finish(): FacadeOutput {
    const prims = this.prims;
    const face = this.face;
    const schedule = [...this.rows.values()].map((r) => ({ ...r, area: Math.round(r.area * 100) / 100, count: Math.round(r.count * 100) / 100 }));
    let g: ReturnType<typeof buildPrimGroup> | null = null;
    return {
      prims, schedule, notes: this.notes,
      meshes3D: () => (g ??= buildPrimGroup(prims, face)),
      elevationSVG: () => primsToSVG(prims, face),
    };
  }
}

export const sz = (...m: number[]) => m.map((v) => Math.round(v * 1000)).join(' × ');

/**
 * Ashlar coursing between datums: every datum (sill, head, slab band, roof…) is a bed joint, and
 * the space between two datums is divided into courses near the nominal height. Slivers merge up.
 */
export function coursesBetween(datums: number[], nominal: number, random: boolean, seed: number): [number, number][] {
  const d: number[] = [];
  for (const z of datums) if (!d.length || z - d[d.length - 1] >= 0.06) d.push(z); else if (z === datums[datums.length - 1]) d[d.length - 1] = z;
  const rnd = rng(seed);
  const out: [number, number][] = [];
  for (let i = 0; i < d.length - 1; i++) {
    const a = d[i], b = d[i + 1], span = b - a;
    const n = Math.max(1, Math.round(span / nominal));
    const wts = new Array(n).fill(0).map(() => (random && n > 1 ? 0.7 + rnd() * 0.6 : 1));
    const sum = wts.reduce((x, y) => x + y, 0);
    let z = a;
    wts.forEach((w, k) => {
      const z1 = k === n - 1 ? b : z + (span * w) / sum;
      out.push([z, z1]);
      z = z1;
    });
  }
  return out;
}

/** u-intervals of [u0,u1] not interrupted by any rect whose z-range overlaps (za,zb) */
export function freeIntervals(u0: number, u1: number, za: number, zb: number, rects: Rect[]): [number, number][] {
  const holes = rects.filter((r) => Math.min(zb, r.y1) - Math.max(za, r.y0) > 1e-4).map((r) => [r.x0, r.x1] as [number, number]);
  return subtract1D(u0, u1, holes).filter(([a, b]) => b - a > 1e-3);
}

/** zones a screen may occupy: every storey plus the parapet */
export function screenZones(c: Ctx): { z0: number; z1: number; index: number }[] {
  const z = c.storeys.map((s) => ({ z0: s.z0, z1: s.z1, index: s.index }));
  z.push({ z0: c.face.roofZ, z1: c.top, index: c.storeys.length });
  return z;
}

/** slab-band datum for frames: the band of floor index i (top of storey i) */
export const slabUnder = (face: Face, levelIdx: number) => face.levels[levelIdx].ffl - SLAB;
