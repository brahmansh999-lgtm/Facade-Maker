// Writes every sheet of the default project (and the acceptance brief) to shots/*.svg
import { mkdirSync, writeFileSync } from 'node:fs';
import { defaultProject, relayout } from '../src/model/defaults.ts';
import { derive } from '../src/model/derive.ts';
import { renderSheet, sheetList, renderCompare } from '../src/drawings/sheets.ts';

mkdirSync('shots', { recursive: true });
const which = process.argv[2] ?? 'default';
let p = defaultProject();
if (which === 'acceptance') p = relayout(p, { brief: { bedrooms: 4, floors: 3 } });
if (process.argv[3]) p.facade.activeTypeId = process.argv[3];
const d = derive(p);
for (const s of sheetList(d)) writeFileSync(`shots/${which}-${s.id}.svg`, renderSheet(d, s.id));
writeFileSync(`shots/${which}-compare.svg`, renderCompare(d, 'front', ['jaali', 'fins', 'louvres', 'stone']));
console.log('written', sheetList(d).length + 1);
