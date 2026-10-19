// project → everything visible. Pure; memoised per project object in the UI.
import type { FaceKey, Level, Project, Side, Warning } from './types.ts';
import { deriveWalls, type Wall } from '../geometry/walls.ts';
import { deriveOpenings, tagOpenings, clearRect, type Opening } from '../geometry/openings.ts';
import { SIDES, buildFaceShell, faceKeyOf, footprint, outerRect, toD, toU, type Face, type FaceOpening } from '../geometry/faces.ts';
import { computeStair, type StairCalc } from '../geometry/stair.ts';
import { polyOf, roomRect, area, type Rect } from '../geometry/rect.ts';
import { faceSun, type FaceSun } from './solar.ts';
import { getFacade } from '../facades/registry.ts';
import type { FacadeOutput, FacadeType, Orientation, Palette } from '../facades/types.ts';
import type { ParamSet } from './types.ts';
import { checkFacade, type FacadeIssue } from '../facades/validate.ts';
import { validate } from './validators.ts';
import { furnishRoom, type Furn } from '../geometry/furniture.ts';
import { BAY, applyMassing, levelRegion } from '../geometry/massing.ts';
import { Region } from '../geometry/region.ts';
import { siteWorks, verandahDeck, type SiteWorks } from '../geometry/sitework.ts';
import { isPlanar, runZoned } from '../facades/zones.ts';
import { EXT_WALL, SLAB } from './units.ts';

export interface LevelDerived { level: Level; walls: Wall[]; openings: Opening[]; clear: Map<string, Rect>; furniture: Furn[] }

export interface Column { x: number; y: number; s: number; z1: number }

export interface FaceDerived {
  face: Face;
  type: FacadeType;
  params: ParamSet;
  palette: Palette;
  orient: Orientation;
  out: FacadeOutput;
  issues: FacadeIssue[];
  overridden: boolean;
}

export interface Derived {
  project: Project;
  footprint: Rect;
  outer: Rect;
  /** true outer outline of every level (L-shapes, notches and bays from the massing moves) */
  regions: Region[];
  /** bounding rectangle of each level's outline */
  outlines: Rect[];
  /** free-standing columns under a long cantilever: plan centre, side, top */
  columns: Column[];
  /** boundary wall, gates, paving, verandah, lawns and trees */
  works: SiteWorks;
  levels: LevelDerived[];
  openings: Opening[];
  stair: StairCalc;
  faces: Record<Side, FaceDerived>;
  sun: Record<Side, FaceSun>;
  warnings: Warning[];
  builtUp: number;
}

/** stair rooms always mirror project.stair.position (single authority) */
export function syncStair(p: Project): Level[] {
  const s = p.stair.position;
  const poly = polyOf({ x0: s.x, y0: s.y, x1: s.x + s.w, y1: s.y + s.h });
  return p.levels.map((l) => ({ ...l, rooms: l.rooms.map((r) => (r.type === 'stair' ? { ...r, polygon: poly } : r)) }));
}

/** a storey that steps back over the one below gets a glazed door out onto that terrace */
function terraceDoor(level: Level, openings: Opening[], below: Region | undefined) {
  if (!below) return;
  const rank: Record<string, number> = { family: 3, living: 3, dining: 3, bedroom: 2, study: 1 };
  const type = (o: Opening) => level.rooms.find((r) => r.id === o.roomId)?.type ?? '';
  const outside = (o: Opening): [number, number] => {
    const d = o.side === 'front' || o.side === 'left' ? -0.6 : 0.6;
    return o.run === 'x' ? [o.center, o.c + d] : [o.c + d, o.center];
  };
  const pick = openings
    .filter((o) => o.kind === 'window' && o.external && rank[type(o)] && below.contains(...outside(o)))
    .sort((a, b) => rank[type(b)] - rank[type(a)] || b.width - a.width)[0];
  if (!pick) return;
  pick.kind = 'garden';
  pick.sill = 0;
  pick.head = Math.max(pick.head, 2.4);
  pick.leaves = pick.width >= 1.2 ? 2 : 1;
  const a = pick.width * (pick.head - pick.sill);
  pick.glazedArea = a * 0.7; pick.ventArea = a * 0.5;
}

/** columns at the free corners of a long cantilever, kept clear of the entrance path */
function cantileverColumns(p: Project, regions: Region[], ent: Opening | undefined): Column[] {
  const m = p.massing;
  if (!m?.columns || m.cantilever < BAY || regions.length < 2) return [];
  const cov = regions[1].minus(regions[0]);
  if (cov.empty) return [];
  const front = regions[1].bbox().y0;
  const strip = cov.rects().filter((r) => Math.abs(r.y0 - front) < 1e-3);
  if (!strip.length) return [];
  const x0 = Math.min(...strip.map((r) => r.x0)), x1 = Math.max(...strip.map((r) => r.x1));
  const s = 0.3, y = front + s / 2 + 0.05, z1 = p.levels[1].elevation - SLAB;
  const xs = [x0 + s / 2 + 0.05, x1 - s / 2 - 0.05];
  if (x1 - x0 > 6.5) xs.splice(1, 0, (x0 + x1) / 2);
  const clear = ent && ent.side === 'front' && ent.run === 'x' ? [ent.center - ent.width / 2 - 0.45 - s / 2, ent.center + ent.width / 2 + 0.45 + s / 2] : null;
  const out: Column[] = [];
  const fits = (x: number) => x >= x0 + s / 2 - 1e-3 && x <= x1 - s / 2 + 1e-3 && !out.some((c) => Math.abs(c.x - x) < 1);
  for (const x of xs) {
    // a column on the entrance path moves to whichever side of it still lands under the cantilever
    const tries = clear && x > clear[0] && x < clear[1] ? [clear[0], clear[1]].sort((a, b) => Math.abs(a - x) - Math.abs(b - x)) : [x];
    const at = tries.find(fits);
    if (at !== undefined) out.push({ x: at, y, s, z1 });
  }
  return out;
}

export function faceOpenings(face: Face, levels: LevelDerived[]): FaceOpening[] {
  const out: FaceOpening[] = [];
  for (const L of levels) {
    for (const o of L.openings) {
      if (!o.external || o.side !== face.side) continue;
      const a = o.center - o.width / 2, b = o.center + o.width / 2;
      const [p0, p1] = o.run === 'x' ? [[a, o.c], [b, o.c]] : [[o.c, a], [o.c, b]];
      const u0 = toU(face, p0[0], p0[1]), u1 = toU(face, p1[0], p1[1]);
      const room = L.level.rooms.find((r) => r.id === o.roomId);
      out.push({
        id: o.id, tag: o.tag, kind: o.kind, u0: Math.min(u0, u1), u1: Math.max(u0, u1),
        z0: L.level.elevation + o.sill, z1: L.level.elevation + o.head, levelIndex: L.level.index,
        reqRatio: o.reqRatio, door: o.kind === 'entrance' || o.kind === 'garden', roomName: room?.name ?? '',
        inset: Math.max(0, -(toD(face, p0[0], p0[1]) + EXT_WALL / 2)),
      });
    }
  }
  return out;
}

// ---- facade memo (also serves catalogue thumbnails)
const memo = new Map<string, FacadeOutput>();
export function runFacade(type: FacadeType, face: Face, orient: Orientation, params: ParamSet, palette: Palette): FacadeOutput {
  const key = JSON.stringify([type.id, face, orient, params, palette]);
  const hit = memo.get(key);
  if (hit) return hit;
  const out = isPlanar(face) ? type.generate(face, face.openings, face.levels, orient, params, palette) : runZoned(type, face, orient, params, palette);
  memo.set(key, out);
  if (memo.size > 120) memo.delete(memo.keys().next().value!);
  return out;
}

export function orientationFor(p: Project, face: Face, sun: FaceSun): Orientation {
  return {
    key: face.key, bearing: face.bearing, latitude: p.site.latitude, climate: p.facade.climateResponse,
    exposure: sun.exposure, cutoff: sun.cutoff, hsa: sun.hsa,
  };
}

export function settingFor(p: Project, key: FaceKey) {
  const pe = p.facade.perElevation[key];
  if (pe?.override) {
    const t = getFacade(pe.typeId);
    return { type: t, params: pe.params, palette: t.palettes[pe.palette] ?? t.palettes[0], overridden: true };
  }
  const t = getFacade(p.facade.activeTypeId);
  return { type: t, params: p.facade.typeParams[t.id] ?? {}, palette: t.palettes[p.facade.typePalette[t.id] ?? 0] ?? t.palettes[0], overridden: false };
}

export function derive(p0: Project): Derived {
  const m0 = p0.massing ?? { cantilever: 0, span: 'full', slide: 0, porch: 0, terrace: 0, lid: 0, columns: false };
  const p: Project = { ...p0, levels: applyMassing(syncStair(p0), m0, p0.stair.position) };
  const regions = p.levels.map(levelRegion);
  const keyFor = (s: Side) => faceKeyOf(s, p.site.northAngle);
  const levels: LevelDerived[] = p.levels.map((level, li) => {
    const walls = deriveWalls(level);
    const openings = deriveOpenings(level, walls, keyFor, p.site.latitude, p.openingOverrides);
    // a door out onto the terrace below, or on the ground floor onto the verandah
    const deck = li === 0 ? verandahDeck(p, regions[0]) : null;
    terraceDoor(level, openings, li === 0 ? (deck ? Region.of([deck]) : undefined) : regions[li - 1]);
    const clear = new Map(level.rooms.map((r) => [r.id, clearRect(r, walls)]));
    const furniture = level.rooms.flatMap((r) => furnishRoom(r, clear.get(r.id)!, openings));
    return { level, walls, openings, clear, furniture };
  });
  const openings = levels.flatMap((l) => l.openings);
  tagOpenings(openings);

  // stair: inner flight on the side that touches circulation
  const sp = p.stair.position;
  const corr = p.levels[0]?.rooms.filter((r) => r.type === 'corridor').map(roomRect) ?? [];
  const vertical = sp.h >= sp.w;
  const touchesMin = corr.some((r) => vertical ? Math.abs(r.x1 - sp.x) < 1e-3 : Math.abs(r.y1 - sp.y) < 1e-3);
  const touchesMax = corr.some((r) => vertical ? Math.abs(r.x0 - (sp.x + sp.w)) < 1e-3 : Math.abs(r.y0 - (sp.y + sp.h)) < 1e-3);
  const stair = computeStair(p.stair, p.brief, touchesMin || !touchesMax);

  const fp = footprint(p);
  const shells = Object.fromEntries(SIDES.map((s) => [s, buildFaceShell(p, s)])) as Record<Side, Omit<Face, 'openings'>>;
  const sunArr = faceSun(p.site.latitude, SIDES.map((s) => shells[s].bearing));
  const sun = Object.fromEntries(SIDES.map((s, i) => [s, sunArr[i]])) as Record<Side, FaceSun>;
  const faces = {} as Record<Side, FaceDerived>;
  for (const s of SIDES) {
    const face: Face = { ...shells[s], openings: [] };
    face.openings = faceOpenings(face, levels);
    const st = settingFor(p, face.key);
    const orient = orientationFor(p, face, sun[s]);
    const out = runFacade(st.type, face, orient, st.params, st.palette);
    faces[s] = { face, type: st.type, params: st.params, palette: st.palette, orient, out, issues: checkFacade(face, out), overridden: st.overridden };
  }
  const o = outerRect(fp);
  const outlines = regions.map((r) => r.bbox());
  const columns = cantileverColumns(p, regions, levels[0]?.openings.find((x) => x.kind === 'entrance'));
  const ent = levels[0]?.openings.find((x) => x.kind === 'entrance');
  const garden = levels[0]?.openings.filter((x) => x.kind === 'garden' && x.side === 'rear').sort((a, b) => (a.roomId.includes('cor') ? -1 : 1) - (b.roomId.includes('cor') ? -1 : 1))[0];
  const works = siteWorks(p, regions, ent, garden);
  const builtUp = regions.reduce((sum, r) => sum + r.area(), 0) + (stair ? (sp.w + 0.23) * (sp.h + 0.23) : 0);
  const d: Derived = { project: p, footprint: fp, outer: o, regions, outlines, columns, works, levels, openings, stair, faces, sun, warnings: [], builtUp };
  d.warnings = validate(d);
  return d;
}

export const roomArea = (L: LevelDerived, roomId: string) => area(L.clear.get(roomId)!);
