import type { FacadeType } from './types.ts';
import { Ctx, coursesBetween, def, freeIntervals } from './kit.ts';
import { lerp } from '../model/units.ts';

const BASE = 0.05;

export const ribbed: FacadeType = {
  id: 'ribbed',
  num: 15,
  name: 'Ribbed cast-stone units',
  description: 'Stacked cast-stone blocks with vertical ribs. Rib depth grows with height so the building gets more shadow — and more texture — toward the sky. Courses come off the same datums as the openings; units stop square at every jamb.',
  params: [
    def({ key: 'uh', label: 'Unit height', unit: 'mm', min: 200, max: 600, step: 10, default: 400 }),
    def({ key: 'uw', label: 'Unit length', unit: 'mm', min: 400, max: 1500, step: 25, default: 800 }),
    def({ key: 'pitch', label: 'Rib pitch', unit: 'mm', min: 50, max: 200, step: 5, default: 100 }),
    def({ key: 'd0', label: 'Rib depth at base', unit: 'mm', min: 10, max: 100, step: 5, default: 20 }),
    def({ key: 'd1', label: 'Rib depth at top', unit: 'mm', min: 10, max: 150, step: 5, default: 80 }),
    def({ key: 'joint', label: 'Joint', unit: 'mm', min: 5, max: 20, step: 1, default: 10 }),
    def({ key: 'stack', label: 'Stacking', unit: '', kind: 'select', default: 'running', options: [
      { value: 'running', label: 'Running bond' }, { value: 'stack', label: 'Stack bond' }] }),
  ],
  palettes: [
    { name: 'Limestone cast', primary: '#d9d1c0', secondary: '#c7bead', accent: '#a69d8d' },
    { name: 'Sandstone cast', primary: '#cfb18d', secondary: '#bb9d7a', accent: '#9a8269' },
    { name: 'Basalt cast', primary: '#77746e', secondary: '#66635e', accent: '#57544f' },
  ],
  generate(face, openings, levels, orient, params, palette) {
    const c = new Ctx(ribbed, face, openings, levels, orient, params, palette);
    const uw = c.m('uw');
    const pitch = c.m('pitch');
    const k = c.clim(0.85, 1.3);
    const rd0 = c.m('d0') * k, rd1 = c.m('d1') * k;
    const j = c.m('joint');
    const running = c.str('stack') === 'running';
    const courses = coursesBetween(c.datums(), c.m('uh'), false, 3);
    const opens = c.openRects(0);
    const byDepth = new Map<number, number>();
    let units = 0, area = 0;
    courses.forEach(([z0, z1], ci) => {
      const t = (0.5 * (z0 + z1) - c.bottom) / Math.max(0.1, c.top - c.bottom);
      const rd = lerp(rd0, rd1, t);
      for (const [a, b] of freeIntervals(0, c.width, z0, z1, opens)) {
        const shift = running && ci % 2 ? uw / 2 : 0;
        let u = a;
        let next = a + (shift ? uw - shift : uw);
        while (u < b - 1e-6) {
          let e = Math.min(b, next);
          if (b - e < 0.15) e = b;
          const x0 = u + j / 2, x1 = e - j / 2;
          if (x1 - x0 > 0.05) {
            // rib profile: base plate with ribs at pitch, rib width half the pitch
            const front: [number, number][] = [];
            const n = Math.max(1, Math.floor((x1 - x0) / pitch));
            const p = (x1 - x0) / n;
            for (let i = n - 1; i >= 0; i--) {
              const r0 = x0 + i * p + p * 0.25, r1 = x0 + i * p + p * 0.75;
              front.push([x0 + (i + 1) * p, BASE], [r1, BASE], [r1, BASE + rd], [r0, BASE + rd], [r0, BASE]);
            }
            front[0] = [x1, BASE];
            front.push([x0, BASE]);
            c.add({ kind: 'prismZ', role: 'solid', fill: ci % 3 === 0 ? palette.secondary : palette.primary, z0: z0 + j / 2, z1: z1 - j / 2, pts: [[x0, 0], [x1, 0], ...front] });
            const key = Math.round(rd * 100) * 10;
            byDepth.set(key, (byDepth.get(key) ?? 0) + 1);
            units++;
            area += (x1 - x0) * (z1 - z0);
          }
          u = e;
          next = e + uw;
        }
      }
    });
    for (const [d, n] of [...byDepth.entries()].sort((x, y) => x[0] - y[0])) c.row('Ribbed unit', `rib ${d} deep, ${Math.round(pitch * 1000)} pitch`, palette.name, n, 0);
    c.row('Cast-stone units (net)', `${Math.round(c.m('uh') * 1000)} nominal course`, palette.name, units, area, 'm²');
    return c.finish();
  },
};
