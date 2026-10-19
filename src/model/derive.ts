// project → everything visible. Pure; memoised per project object in the UI.
import type { FaceKey, Level, Project, Side, Warning } from './types.ts';
import { deriveWalls, type Wall } from '../geometry/walls.ts';
import { deriveOpenings, tagOpenings, clearRect, type Opening } from '../geometry/openings.ts';
import { SIDES, buildFaceShell, faceKeyOf, footprint, outerRect, toU, type Face, type FaceOpening } from '../geometry/faces.ts';
import { computeStair, type StairCalc } from '../geometry/stair.ts';
import { polyOf, roomRect, area, type Rect } from '../geometry/rect.ts';
import { faceSun, type FaceSun } from './solar.ts';
import { getFacade } from '../facades/registry.ts';
import type { FacadeOutput, FacadeType, Orientation, Palette } from '../facades/types.ts';
import type { ParamSet } from './types.ts';
import { checkFacade, type FacadeIssue } from '../facades/validate.ts';
import { validate } from './validators.ts';
import { furnishRoom, type Furn } from '../geometry/furniture.ts';

export interface LevelDerived { level: Level; walls: Wall[]; openings: Opening[]; clear: Map<string, Rect>; furniture: Furn[] }

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
  const out = type.generate(face, face.openings, face.levels, orient, params, palette);
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
  const p: Project = { ...p0, levels: syncStair(p0) };
  const keyFor = (s: Side) => faceKeyOf(s, p.site.northAngle);
  const levels: LevelDerived[] = p.levels.map((level) => {
    const walls = deriveWalls(level);
    const openings = deriveOpenings(level, walls, keyFor, p.site.latitude, p.openingOverrides);
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
  const builtUp = levels.length * area(o) + (stair ? (sp.w + 0.23) * (sp.h + 0.23) : 0);
  const d: Derived = { project: p, footprint: fp, outer: o, levels, openings, stair, faces, sun, warnings: [], builtUp };
  d.warnings = validate(d);
  return d;
}

export const roomArea = (L: LevelDerived, roomId: string) => area(L.clear.get(roomId)!);
