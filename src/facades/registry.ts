import type { FacadeType } from './types.ts';
import type { ParamSet } from '../model/types.ts';
import { jaali } from './jaali.ts';
import { fins } from './fins.ts';
import { louvres } from './louvres.ts';
import { eggcrate } from './eggcrate.ts';
import { brick } from './brick.ts';
import { fluted } from './fluted.ts';
import { corten } from './corten.ts';
import { render } from './render.ts';
import { doubleskin } from './doubleskin.ts';
import { baguettes } from './baguettes.ts';
import { folded } from './folded.ts';
import { stone } from './stone.ts';
import { shutters } from './shutters.ts';
import { green } from './green.ts';
import { ribbed } from './ribbed.ts';

export const FACADES: FacadeType[] = [
  jaali, fins, louvres, eggcrate, brick, fluted, corten, render, doubleskin, baguettes, folded, stone, shutters, green, ribbed,
];

const byId = new Map(FACADES.map((f) => [f.id, f]));
export const getFacade = (id: string): FacadeType => byId.get(id) ?? FACADES[0];

export function defaultParams(t: FacadeType): ParamSet {
  return Object.fromEntries(t.params.map((p) => [p.key, p.default]));
}
export const fnum = (n: number) => String(n).padStart(2, '0');
