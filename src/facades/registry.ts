import type { FacadeType } from './types.ts';
import type { ParamSet } from '../model/types.ts';
import { voronoi } from './voronoi.ts';
import { flow } from './flow.ts';
import { chroma } from './chroma.ts';
import { vweb } from './vweb.ts';
import { bubbles } from './bubbles.ts';
import { mosaic } from './mosaic.ts';
import { fins } from './fins.ts';
import { aerofoil } from './aerofoil.ts';
import { diagrid } from './diagrid.ts';
import { perforated } from './perforated.ts';
import { hex } from './hex.ts';
import { dichroic } from './dichroic.ts';
import { ribbons } from './ribbons.ts';
import { eggcrate } from './eggcrate.ts';
import { garden } from './garden.ts';

export const FACADES: FacadeType[] = [
  voronoi, chroma, vweb, flow, bubbles, mosaic, dichroic, ribbons, fins, aerofoil, diagrid, perforated, hex, eggcrate, garden,
];

const byId = new Map(FACADES.map((f) => [f.id, f]));
export const hasFacade = (id: string) => byId.has(id);
export const getFacade = (id: string): FacadeType => byId.get(id) ?? FACADES[0];

export function defaultParams(t: FacadeType): ParamSet {
  return Object.fromEntries(t.params.map((p) => [p.key, p.default]));
}
export const fnum = (n: number) => String(n).padStart(2, '0');
