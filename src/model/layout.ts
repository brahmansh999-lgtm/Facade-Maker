// Auto-layout from the brief.
// Plan strategy (double-loaded, one vertical core):
//   x: [ left zone | corridor 1.2 | right zone ]
//   right zone, front→rear: [ front room | stair enclosure + landing lobby | wet core | rear room ]
// Public rooms sit on the ground floor facing the street; bedrooms go above (or to the rear on
// single-storey briefs); the stair and every wet cell stack on the same core on every level.

import type { Brief, Grid, Level, Room, RoomType, Site, StairSpec } from './types.ts';
import { EXT_WALL, clamp, r3, snap, snapDown, snapUp } from './units.ts';
import { sizeStair } from '../geometry/stair.ts';
import { polyOf, type Rect } from '../geometry/rect.ts';

export const CORRIDOR = 1.2;
export const WET_ROW = 2.1;
const MAX_SPAN = 5.5;

interface Spec { type: RoomType; name: string; pref: number; fixed?: number }

const PREF: Partial<Record<RoomType, number>> = {
  living: 5.1, dining: 3.6, bedroom: 3.75, study: 3.0, family: 3.6, store: 2.4, foyer: 3.0, kitchen: 3.3,
};
const spec = (type: RoomType, name: string): Spec => ({ type, name, pref: PREF[type] ?? 3.3 });

export interface LayoutResult { grid: Grid; levels: Level[]; stair: StairSpec; unplaced: string[] }

function splitBays(lines: number[]): number[] {
  const bays: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const span = lines[i] - lines[i - 1];
    if (span < 1e-6) continue;
    const parts = Math.ceil(span / MAX_SPAN - 1e-9);
    let acc = 0;
    for (let k = 0; k < parts; k++) {
      const b = k === parts - 1 ? r3(span - acc) : snap(span / parts);
      bays.push(b);
      acc += b;
    }
  }
  return bays;
}

/** Distribute a depth among stacked specs proportional to their preferred depth. */
function splitDepth(specs: Spec[], depth: number): number[] {
  const fixed = specs.reduce((a, s) => a + (s.fixed ?? 0), 0);
  const flex = specs.filter((s) => s.fixed === undefined);
  const prefSum = flex.reduce((a, s) => a + s.pref, 0) || 1;
  const avail = Math.max(0, depth - fixed);
  const out: number[] = [];
  let acc = 0;
  specs.forEach((s, i) => {
    let d: number;
    if (i === specs.length - 1) d = r3(depth - acc);
    else if (s.fixed !== undefined) d = s.fixed;
    else d = snap((avail * s.pref) / prefSum);
    out.push(d);
    acc += d;
  });
  return out;
}

export function solveLayout(site: Site, briefIn: Brief, stairType: StairSpec['type'] = 'dogleg'): LayoutResult {
  const brief = { ...briefIn };
  const F = clamp(Math.round(brief.floors), 1, 3);
  const B = clamp(Math.round(brief.bedrooms), 1, 5);
  const baths = Math.max(1, Math.round(brief.bathrooms));
  let studies = Math.max(0, Math.round(brief.studies));
  const H = brief.floorToFloor;
  const sb = site.setbacks;
  const unplaced: string[] = [];

  // ---- footprint width & zones
  const bw = site.width - sb.left - sb.right - EXT_WALL;
  const bd = site.depth - sb.front - sb.rear - EXT_WALL;
  const W = Math.max(4.8, snapDown(bw));
  let wR = snap(clamp((W - CORRIDOR) * 0.42, 2.4, 5.4));
  let wL = r3(W - CORRIDOR - wR);
  if (wL < 2.7) {
    wL = Math.max(2.4, snapDown(W - CORRIDOR - 2.4));
    wR = r3(W - CORRIDOR - wL);
  }
  const roomyRight = wR >= 2.7;

  // ---- stair enclosure
  const nominalBox = stairType === 'dogleg' ? 2.1 : 1.2;
  // a landing lobby beside the stair only if it can be a proper ≥1.0 m clear corridor
  const boxW = wR - nominalBox >= 1.2 ? nominalBox : wR;
  const sz = sizeStair(stairType, H, boxW);
  const Ls = snapUp(sz.length);
  const lobbyW = r3(wR - boxW);

  // ---- wet core sizing (identical on every level so services stack)
  const bathsPerFloor: number[] = new Array(F).fill(0);
  if (F === 1) bathsPerFloor[0] = baths;
  else {
    bathsPerFloor[0] = 1;
    let rem = baths - 1;
    for (let j = 1; j < F; j++) {
      const share = Math.ceil(rem / (F - j));
      bathsPerFloor[j] = share;
      rem -= share;
    }
  }
  const wetNeed = bathsPerFloor.map((b, i) => b + (i === 0 ? 1 : 0)); // + utility on ground
  const cols = wR >= 3.0 ? 2 : 1;
  const rows = clamp(Math.ceil(Math.max(...wetNeed) / cols), 1, 2);
  const Lw = rows * WET_ROW;
  const coreLen = Ls + Lw;

  // ---- programme per level
  const lv: { left: Spec[]; rf: Spec | null; rr: Spec | null }[] = [];
  for (let i = 0; i < F; i++) lv.push({ left: [], rf: null, rr: null });
  const gf = lv[0];
  gf.left.push(spec('living', 'LIVING'), spec('dining', 'DINING'));
  gf.rr = spec('kitchen', 'KITCHEN');

  let bedNo = 0;
  const bedName = () => (++bedNo === 1 ? 'MASTER BEDROOM' : `BEDROOM ${bedNo}`);
  let bedsLeft = B;

  // depth needed before upper-floor slot counts are known
  const leftNeedGF = F === 1
    ? PREF.living! + PREF.dining! + Math.max(0, B - (roomyRight ? 1 : 0)) * PREF.bedroom! + studies * PREF.study!
    : PREF.living! + PREF.dining!;
  // right-zone rooms need ≥ 9.5 m² clear: depth from the zone width
  const slotDepth = Math.max(3.3, snapUp(9.9 / Math.max(2.4, wR - 0.17) + 0.17));
  const rightNeed = coreLen + 2 * slotDepth;
  const D = Math.min(snapDown(bd), snapUp(Math.max(rightNeed, leftNeedGF, 9.0)));
  const kL = clamp(Math.round(D / 4.2), 2, 4);
  const minLeft = Math.ceil(D / 7.2 - 1e-9);

  if (F === 1) {
    if (roomyRight && bedsLeft > 0) { gf.rf = spec('bedroom', bedName()); bedsLeft--; }
    while (bedsLeft > 0) { gf.left.push(spec('bedroom', bedName())); bedsLeft--; }
    while (studies > 0) {
      if (!gf.rf) gf.rf = spec('study', 'STUDY'); else gf.left.push(spec('study', 'STUDY'));
      studies--;
    }
  } else {
    for (let j = 1; j < F; j++) {
      const L = lv[j];
      if (j === 1 && brief.doubleHeightLiving) L.left.push({ type: 'void', name: 'VOID — DOUBLE HT.', pref: 0 });
      const put = (s: Spec, prefs: ('rr' | 'rf' | 'left')[], needsWidth: boolean) => {
        for (const p of prefs) {
          if (p === 'left') { if (L.left.length < kL) { L.left.push(s); return true; } continue; }
          if (L[p] === null && (!needsWidth || roomyRight)) { L[p] = s; return true; }
        }
        return false;
      };
      const share = Math.ceil(bedsLeft / (F - j));
      for (let b = 0; b < share; b++) {
        if (!put(spec('bedroom', ''), ['rr', 'left', 'rf'], true)) break;
        bedsLeft--;
      }
      while (studies > 0 && put(spec('study', 'STUDY'), ['rf', 'left'], false)) studies--;
      const hasFamily = () => [L.rf, L.rr, ...L.left].some((s) => s?.type === 'family');
      if (!hasFamily()) put(spec('family', 'FAMILY'), L.left.length < minLeft ? ['left', 'rf', 'rr'] : ['rf', 'left', 'rr'], false);
      while (L.left.filter((s) => s.type !== 'void').length < minLeft) L.left.push(hasFamily() ? spec('store', 'STORE') : spec('family', 'FAMILY'));
      if (!L.rf) L.rf = spec('store', 'STORE');
      if (!L.rr) L.rr = spec('store', 'STORE');
    }
    // overflow to the ground floor front room
    if (bedsLeft > 0 && !gf.rf && roomyRight) { gf.rf = spec('bedroom', ''); bedsLeft--; }
    if (studies > 0 && !gf.rf) { gf.rf = spec('study', 'STUDY'); studies--; }
  }
  if (!gf.rf) gf.rf = spec('foyer', 'FOYER');
  for (let b = 0; b < bedsLeft; b++) unplaced.push('Bedroom');
  for (let s = 0; s < studies; s++) unplaced.push('Study');

  // name bedrooms bottom-up, rear first, so the master lands on the first upper floor
  for (const L of [...lv.slice(1), lv[0]]) {
    for (const s of [L.rr, ...L.left, L.rf]) if (s && s.type === 'bedroom' && !s.name) s.name = bedName();
  }
  for (const L of lv) for (const s of [L.rr, ...L.left, L.rf]) if (s && s.type === 'bedroom' && !s.name) s.name = bedName();

  // ---- right zone slots
  const remaining = r3(D - coreLen);
  let Fs: number, Rs: number;
  if (remaining >= 2 * slotDepth - 0.3) { Fs = snap(remaining / 2); Rs = r3(remaining - Fs); }
  else { Fs = Math.max(0, remaining); Rs = 0; }
  if (Rs === 0) {
    for (const L of lv) {
      if (!L.rr) continue;
      const low = !L.rf || ['foyer', 'store', 'family'].includes(L.rf.type);
      if (L.rr.type !== 'store' && low) L.rf = L.rr;
      else if (L.rr.type !== 'store') unplaced.push(L.rr.name || L.rr.type);
      L.rr = null;
    }
  }
  if (Fs <= 0) for (const L of lv) { if (L.rf && L.rf.type !== 'store' && L.rf.type !== 'foyer') unplaced.push(L.rf.name); L.rf = null; }

  // ---- placement
  const ox = r3(sb.left + EXT_WALL / 2 + Math.max(0, (bw - W) / 2));
  const oy = r3(sb.front + EXT_WALL / 2);
  const mk = (id: string, type: RoomType, name: string, r: Rect): Room => ({
    id, type, name,
    polygon: polyOf({ x0: r3(ox + r.x0), y0: r3(oy + r.y0), x1: r3(ox + r.x1), y1: r3(oy + r.y1) }),
  });
  const xC0 = wL, xC1 = r3(wL + CORRIDOR), xBox = r3(W - boxW);
  const yS0 = Fs, yS1 = r3(Fs + Ls), yW1 = r3(Fs + Ls + Lw);
  const c0 = cols === 2 ? snap(wR / 2) : wR;

  let livingDepth = 0;
  const levels: Level[] = lv.map((L, i) => {
    const id = `L${i}`;
    const rooms: Room[] = [];
    // left zone
    if (i === 1 && L.left[0]?.type === 'void') L.left[0].fixed = livingDepth;
    const depths = splitDepth(L.left, D);
    let y = 0;
    L.left.forEach((s, k) => {
      const d = depths[k];
      if (i === 0 && s.type === 'living') livingDepth = d;
      rooms.push(mk(`${id}-left-${k}`, s.type, s.name, { x0: 0, y0: y, x1: wL, y1: r3(y + d) }));
      y = r3(y + d);
    });
    rooms.push(mk(`${id}-cor`, 'corridor', i === 0 ? 'HALL' : 'PASSAGE', { x0: xC0, y0: 0, x1: xC1, y1: D }));
    if (L.rf && Fs > 0) rooms.push(mk(`${id}-rf`, L.rf.type, L.rf.name, { x0: xC1, y0: 0, x1: W, y1: yS0 }));
    if (lobbyW > 0) rooms.push(mk(`${id}-lobby`, 'corridor', 'LANDING', { x0: xC1, y0: yS0, x1: xBox, y1: yS1 }));
    rooms.push(mk(`${id}-stair`, 'stair', 'STAIR', { x0: xBox, y0: yS0, x1: W, y1: yS1 }));
    if (L.rr && Rs > 0) rooms.push(mk(`${id}-rr`, L.rr.type, L.rr.name, { x0: xC1, y0: yW1, x1: W, y1: D }));

    // wet cells, ordered by access: corridor-side column, then the outer cell attached to the rear room
    type Cell = { r: number; c: number; rect: Rect; access: 'corridor' | 'attached' | 'none' };
    const cells: Cell[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x0 = c === 0 ? xC1 : r3(xC1 + c0);
        const x1 = c === 0 && cols === 2 ? r3(xC1 + c0) : W;
        const cy0 = r3(yS1 + r * WET_ROW), cy1 = r3(yS1 + (r + 1) * WET_ROW);
        const access = c === 0 ? 'corridor' : r === rows - 1 && Rs > 0 ? 'attached' : 'none';
        cells.push({ r, c, rect: { x0, y0: cy0, x1, y1: cy1 }, access });
      }
    }
    const byAccess = (a: Cell['access']) => cells.filter((c) => c.access === a);
    const assigned = new Map<Cell, { type: RoomType; name: string }>();
    const take = (pref: Cell['access'][], item: { type: RoomType; name: string }) => {
      for (const a of pref) {
        const c = byAccess(a).find((x) => !assigned.has(x));
        if (c) { assigned.set(c, item); return true; }
      }
      return false;
    };
    const nb = bathsPerFloor[i];
    if (i === 0) {
      take(['attached', 'corridor'], { type: 'utility', name: 'UTILITY' });
      for (let b = 0; b < nb; b++) {
        const it = F === 1 ? { type: 'bath' as RoomType, name: nb > 1 ? `BATH ${b + 1}` : 'BATH' } : { type: 'wc' as RoomType, name: 'WC' };
        if (!take(['corridor', 'attached'], it)) unplaced.push(`${it.name} (L${i})`);
      }
    } else {
      for (let b = 0; b < nb; b++) {
        const attachedFirst = nb >= 2 && b === 0 && L.rr?.type === 'bedroom';
        const ok = attachedFirst
          ? take(['attached', 'corridor'], { type: 'bath', name: 'ATT. BATH' })
          : take(['corridor', 'attached'], { type: 'bath', name: 'BATH' });
        if (!ok) unplaced.push(`Bath (L${i})`);
      }
    }
    for (const c of cells) {
      const a = assigned.get(c) ?? (c.access === 'none' ? { type: 'shaft' as RoomType, name: 'DUCT' } : { type: 'store' as RoomType, name: 'STORE' });
      rooms.push(mk(`${id}-wet-${c.r}-${c.c}`, a.type, a.name, c.rect));
    }
    return { id, index: i, elevation: r3(brief.plinth + i * H), rooms };
  });

  const xl = [0, wL, xC1, W];
  const yl = [0, yS0, yS1, yW1, D].filter((v, k, a) => k === 0 || v > a[k - 1] + 1e-6);
  const grid: Grid = { origin: [ox, oy], xBays: splitBays(xl), yBays: splitBays(yl) };
  const stair: StairSpec = { type: stairType, position: { x: r3(ox + xBox), y: r3(oy + yS0), w: boxW, h: Ls } };
  return { grid, levels, stair, unplaced };
}
