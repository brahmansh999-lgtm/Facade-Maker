import type { Object3D } from 'three';
import type { FaceKey, ParamSet, ParamValue } from '../model/types.ts';
import type { Face, FaceLevel, FaceOpening } from '../geometry/faces.ts';

export type { Face, FaceLevel, FaceOpening };

export interface ParamDef {
  key: string;
  label: string;
  unit: string;
  kind: 'range' | 'select' | 'toggle';
  min?: number;
  max?: number;
  step?: number;
  default: ParamValue;
  options?: { value: string; label: string }[];
}

export interface Palette { name: string; primary: string; secondary: string; accent: string }

export interface Orientation {
  key: FaceKey;
  bearing: number;
  latitude: number;
  climate: boolean;
  /** 0..1 relative solar exposure of this face */
  exposure: number;
  /** vertical shadow angle to cut off, degrees */
  cutoff: number;
  /** horizontal shadow angle, degrees */
  hsa: number;
}

/**
 * Facade primitives live in face-local coordinates:
 *   u — along the face, left→right as seen from outside (m)
 *   z — height above natural ground (m)
 *   d — distance outward from the outer wall face (m, ≥ 0 sits proud of the wall)
 */
interface PrimBase {
  /** solid elements may never overlap openings; screens may, with porosity ≥ the opening's need */
  role: 'solid' | 'screen';
  porosity?: number;
  fill: string;
  /** opacity used by perforated/mesh skins in 3D */
  opacity?: number;
}
export interface BoxPrim extends PrimBase { kind: 'box'; u: number; z: number; w: number; h: number; d0: number; d1: number; rot?: number }
export interface PrismZPrim extends PrimBase { kind: 'prismZ'; z0: number; z1: number; pts: [number, number][] }
export interface PrismUPrim extends PrimBase { kind: 'prismU'; u0: number; u1: number; pts: [number, number][] }
export interface DiscPrim extends PrimBase { kind: 'disc'; u: number; z: number; r: number; d: number }
export interface LinePrim extends PrimBase { kind: 'line'; pts: [number, number, number][]; width: number }
export interface PerfPrim extends PrimBase { kind: 'perf'; u: number; z: number; w: number; h: number; d0: number; d1: number; holes: [number, number, number][] }
export interface MeshPrim extends PrimBase { kind: 'mesh'; u: number; z: number; w: number; h: number; d0: number; d1: number; pitch: number }
/** flat plate of any planar polygon in space (u,z,d) — kinetic panels, facets, ribbons */
export interface FacetPrim extends PrimBase { kind: 'facet'; pts: [number, number, number][]; /** no ink edges: crease read by tone only */ soft?: boolean }
/** straight member between two points in the elevation plane, square-ish section w × (d1−d0) */
export interface BarPrim extends PrimBase { kind: 'bar'; a: [number, number]; b: [number, number]; w: number; d0: number; d1: number }
/** smooth member swept along a polyline in the elevation plane; pts are (u, z, front depth), back at d0 */
export interface SweepPrim extends PrimBase { kind: 'sweep'; pts: [number, number, number][]; w: number; d0: number }
export type Prim = BoxPrim | PrismZPrim | PrismUPrim | DiscPrim | LinePrim | PerfPrim | MeshPrim | FacetPrim | BarPrim | SweepPrim;

export interface ScheduleRow { element: string; count: number; size: string; material: string; area: number; unit: 'nr' | 'm' | 'm²' }

export interface FacadeOutput {
  prims: Prim[];
  schedule: ScheduleRow[];
  notes: string[];
  /** three.js group for this face, built lazily (MeshBasicMaterial + edges only) */
  meshes3D: () => Object3D;
  /** standalone elevation SVG of the facade layer, metres as user units */
  elevationSVG: () => string;
}

export interface FacadeType {
  id: string;
  num: number;
  name: string;
  description: string;
  params: ParamDef[];
  palettes: [Palette, Palette, Palette];
  generate(face: Face, openings: FaceOpening[], levels: FaceLevel[], orientation: Orientation, params: ParamSet, palette: Palette): FacadeOutput;
}
