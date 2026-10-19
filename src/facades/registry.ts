import type { FacadeType } from './types.ts';
import type { ParamSet } from '../model/types.ts';
import { pixels } from './pixels.ts';
import { fins } from './fins.ts';
import { aerofoil } from './aerofoil.ts';
import { diagrid } from './diagrid.ts';
import { perforated } from './perforated.ts';
import { doubleskin } from './doubleskin.ts';
import { hex } from './hex.ts';
import { kinetic } from './kinetic.ts';
import { dichroic } from './dichroic.ts';
import { ribbons } from './ribbons.ts';
import { folded } from './folded.ts';
import { fluted } from './fluted.ts';
import { eggcrate } from './eggcrate.ts';
import { ribbed } from './ribbed.ts';
import { garden } from './garden.ts';

export const FACADES: FacadeType[] = [
  pixels, fins, aerofoil, diagrid, perforated, doubleskin, hex, kinetic, dichroic, ribbons, folded, fluted, eggcrate, ribbed, garden,
];

const byId = new Map(FACADES.map((f) => [f.id, f]));
export const hasFacade = (id: string) => byId.has(id);
export const getFacade = (id: string): FacadeType => byId.get(id) ?? FACADES[0];

export function defaultParams(t: FacadeType): ParamSet {
  return Object.fromEntries(t.params.map((p) => [p.key, p.default]));
}
export const fnum = (n: number) => String(n).padStart(2, '0');
