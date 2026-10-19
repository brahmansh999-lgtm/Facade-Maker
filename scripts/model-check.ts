// Headless acceptance test: node scripts/acceptance.ts
import { defaultProject, relayout } from '../src/model/defaults.ts';
import { derive, runFacade, orientationFor } from '../src/model/derive.ts';
import { FACADES, defaultParams } from '../src/facades/registry.ts';
import { checkFacade } from '../src/facades/validate.ts';
import { SIDES } from '../src/geometry/faces.ts';
import type { Project } from '../src/model/types.ts';

let failures = 0;
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? '  ok ' : ' FAIL'}  ${msg}`); if (!cond) failures++; };

function summary(p: Project, label: string) {
  const t0 = performance.now();
  const d = derive(p);
  const ms = performance.now() - t0;
  console.log(`\n== ${label}  (derive ${ms.toFixed(0)} ms)`);
  for (const L of d.levels) {
    console.log(`  L${L.level.index} FFL +${L.level.elevation.toFixed(3)}  ${L.level.rooms.map((r) => `${r.name}`).join(', ')}`);
  }
  console.log(`  stair: ${d.stair.type} ${d.stair.n}R × ${Math.round(d.stair.R * 1000)} / T ${Math.round(d.stair.T * 1000)}  2R+T ${Math.round(d.stair.twoRT * 1000)}  headroom ${d.stair.headroom.toFixed(2)}  enclosure ${d.stair.short.toFixed(2)}×${d.stair.long.toFixed(2)} (needs ${d.stair.requiredWidth.toFixed(2)}×${d.stair.requiredLength.toFixed(2)})`);
  console.log(`  openings: ${d.openings.length}  (${d.openings.filter((o) => o.kind === 'window').length} windows, ${d.openings.filter((o) => o.kind === 'door').length} doors)`);
  console.log(`  warnings (${d.warnings.length}):`);
  for (const w of d.warnings) console.log(`    [${w.severity}] ${w.message}`);
  return d;
}

const p1 = defaultProject();
const d1 = summary(p1, 'Default brief: 2 floors, 3 bedrooms');
const p2 = relayout(p1, { brief: { bedrooms: 4, floors: 3 } });
const d2 = summary(p2, 'Acceptance: 3 floors, 4 bedrooms');

console.log('\n== Acceptance checks');
ok(d2.levels.length === 3, 'plans re-layout to 3 levels');
ok(d2.levels.flatMap((l) => l.level.rooms).filter((r) => r.type === 'bedroom').length === 4, '4 bedrooms placed');
ok(d2.stair.n === Math.ceil(p2.brief.floorToFloor / 0.175 - 1e-9) && d2.stair.R <= 0.175, `stair risers recalculated (${d2.stair.n} @ ${Math.round(d2.stair.R * 1000)} mm)`);
ok(d2.openings.length > d1.openings.length, `openings regenerated (${d1.openings.length} → ${d2.openings.length})`);
ok(JSON.stringify(d1.warnings) !== JSON.stringify(d2.warnings) || d2.warnings.length === 0, 'warnings list recomputed');
ok(d2.faces.front.face.levels.length === 3 && Math.abs(d2.faces.front.face.parapetTop - (0.45 + 3 * 3.2 + 1)) < 1e-6, 'elevation datums follow 3 floors');

for (const [label, d, p] of [['default', d1, p1], ['acceptance', d2, p2]] as const) {
  let bad = 0, prims = 0;
  const t0 = performance.now();
  for (const t of FACADES) {
    for (const s of SIDES) {
      const f = d.faces[s];
      const out = runFacade(t, f.face, orientationFor(p, f.face, d.sun[s]), defaultParams(t), t.palettes[0]);
      prims += out.prims.length;
      const issues = checkFacade(f.face, out);
      if (issues.length) { bad++; console.log(`    ${t.name} / ${f.face.key}: ${issues.map((i) => i.detail).join('; ')}`); }
      if (!out.schedule.length) { bad++; console.log(`    ${t.name}: empty schedule`); }
    }
  }
  ok(bad === 0, `${label}: 15 facades × 4 faces generate with no geometry over openings (${prims} elements, ${(performance.now() - t0).toFixed(0)} ms)`);
}


console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
