// Single source of truth. Everything visible in the app is derived from a Project.

export type Vec2 = [number, number];
export type FaceKey = 'N' | 'S' | 'E' | 'W';
/** Building side in plan terms. Plan y runs from the street (front, y small) to the rear. */
export type Side = 'front' | 'rear' | 'left' | 'right';

export type RoomType =
  | 'living' | 'dining' | 'kitchen' | 'bedroom' | 'bath' | 'wc' | 'study'
  | 'utility' | 'stair' | 'corridor' | 'family' | 'void' | 'foyer' | 'store' | 'shaft';

export interface Room {
  id: string;
  type: RoomType;
  name: string;
  /** Axis-aligned rectangle, centreline coordinates (wall centrelines), metres, CCW. */
  polygon: Vec2[];
}

export interface Level {
  id: string;
  index: number;
  /** FFL above natural ground level (NGL = ±0.000), metres. */
  elevation: number;
  rooms: Room[];
}

export interface Site {
  width: number;
  depth: number;
  setbacks: { front: number; rear: number; left: number; right: number };
  /** Degrees clockwise from plan-up (+y, toward the rear) to true north. */
  northAngle: number;
  latitude: number;
}

export interface Brief {
  floors: number;
  bedrooms: number;
  bathrooms: number;
  studies: number;
  parking: number;
  doubleHeightLiving: boolean;
  floorToFloor: number;
  plinth: number;
}

export interface Grid {
  /** Plan position of grid line 1 / A (wall centreline at the front-left corner). */
  origin: Vec2;
  xBays: number[];
  yBays: number[];
}

export interface StairRect { x: number; y: number; w: number; h: number }

export interface StairSpec {
  type: 'dogleg' | 'straight';
  /** Stair enclosure rectangle (centreline), stacked identically on every level. */
  position: StairRect;
}

export type ParamValue = number | string | boolean;
export type ParamSet = Record<string, ParamValue>;

export interface ElevationSetting {
  override: boolean;
  typeId: string;
  params: ParamSet;
  palette: number;
}

export interface FacadeState {
  activeTypeId: string;
  climateResponse: boolean;
  typeParams: Record<string, ParamSet>;
  typePalette: Record<string, number>;
  perElevation: Record<FaceKey, ElevationSetting>;
}

export interface OpeningOverride {
  width?: number;
  sill?: number;
  head?: number;
  /** Shift of the opening centre along its wall, metres. */
  shift?: number;
  suppressed?: boolean;
}

export interface Project {
  version: 1;
  name: string;
  site: Site;
  brief: Brief;
  grid: Grid;
  levels: Level[];
  stair: StairSpec;
  facade: FacadeState;
  openingOverrides: Record<string, OpeningOverride>;
  /** Programme items the layout solver could not place. */
  unplaced: string[];
}

export interface Warning {
  code: string;
  severity: 'warn' | 'fail';
  message: string;
  level?: number;
  ref?: string;
}
