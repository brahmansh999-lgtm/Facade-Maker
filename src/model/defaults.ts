import type { Brief, ElevationSetting, FaceKey, FacadeState, Project, Site, StairSpec } from './types.ts';
import { solveLayout } from './layout.ts';
import { FACADES, defaultParams, getFacade, hasFacade } from '../facades/registry.ts';

export const DEFAULT_SITE: Site = {
  width: 12,
  depth: 24,
  setbacks: { front: 6, rear: 2, left: 1.5, right: 1.5 },
  northAngle: 0,
  latitude: 28.6,
};

export const DEFAULT_BRIEF: Brief = {
  floors: 2,
  bedrooms: 3,
  bathrooms: 3,
  studies: 1,
  parking: 1,
  doubleHeightLiving: false,
  floorToFloor: 3.2,
  plinth: 0.45,
};

export function defaultFacade(active = 'pixels'): FacadeState {
  const t = getFacade(active);
  const pe = (): ElevationSetting => ({ override: false, typeId: t.id, params: defaultParams(t), palette: 0 });
  return {
    activeTypeId: t.id,
    climateResponse: true,
    typeParams: Object.fromEntries(FACADES.map((f) => [f.id, defaultParams(f)])),
    typePalette: Object.fromEntries(FACADES.map((f) => [f.id, 0])),
    perElevation: { N: pe(), S: pe(), E: pe(), W: pe() } as Record<FaceKey, ElevationSetting>,
  };
}

export function defaultProject(): Project {
  const lay = solveLayout(DEFAULT_SITE, DEFAULT_BRIEF, 'dogleg');
  return {
    version: 1,
    name: 'Residence, Plot 14',
    site: structuredClone(DEFAULT_SITE),
    brief: { ...DEFAULT_BRIEF },
    grid: lay.grid,
    levels: lay.levels,
    stair: lay.stair,
    facade: defaultFacade(),
    openingOverrides: {},
    unplaced: lay.unplaced,
  };
}

/** Re-run the layout solver after a brief/site change, keeping facade settings and overrides. */
export function relayout(p: Project, changes: { brief?: Partial<Brief>; site?: Partial<Site>; stairType?: StairSpec['type'] }): Project {
  const brief = { ...p.brief, ...changes.brief };
  const site = { ...p.site, ...changes.site, setbacks: { ...p.site.setbacks, ...changes.site?.setbacks } };
  const lay = solveLayout(site, brief, changes.stairType ?? p.stair.type);
  return { ...p, brief, site, grid: lay.grid, levels: lay.levels, stair: lay.stair, unplaced: lay.unplaced };
}

/** Fill any params missing from an imported/older project with registry defaults. */
export function normaliseProject(p: Project): Project {
  const f = p.facade;
  // retired facade types (older saves) fall back to the first in the catalogue
  if (!hasFacade(f.activeTypeId)) f.activeTypeId = FACADES[0].id;
  for (const k of Object.keys(f.typeParams)) if (!hasFacade(k)) delete f.typeParams[k];
  for (const k of Object.keys(f.typePalette)) if (!hasFacade(k)) delete f.typePalette[k];
  for (const k of ['N', 'S', 'E', 'W'] as FaceKey[]) {
    const e = f.perElevation[k];
    if (e && !hasFacade(e.typeId)) f.perElevation[k] = { override: false, typeId: f.activeTypeId, params: {}, palette: 0 };
  }
  for (const t of FACADES) {
    f.typeParams[t.id] = { ...defaultParams(t), ...(f.typeParams[t.id] ?? {}) };
    f.typePalette[t.id] ??= 0;
  }
  for (const k of ['N', 'S', 'E', 'W'] as FaceKey[]) {
    const e = f.perElevation[k] ?? { override: false, typeId: f.activeTypeId, params: {}, palette: 0 };
    e.params = { ...defaultParams(getFacade(e.typeId)), ...e.params };
    f.perElevation[k] = e;
  }
  p.openingOverrides ??= {};
  p.unplaced ??= [];
  return p;
}
