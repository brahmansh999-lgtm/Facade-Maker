import type { FacadeType } from './types.ts';
import { Ctx, coursesBetween, def, freeIntervals } from './kit.ts';
import { rng } from '../model/units.ts';
import { mix, shade } from '../drawings/color.ts';

export const stone: FacadeType = {
  id: 'stone',
  num: 12,
  name: 'Stone, shadow-gap joints',
  description: 'Dry-fixed ashlar on stainless anchors. Bed joints are set out from the building’s datums — plinth, every sill and head, slab bands, roof and coping — so no stone is ever cut around a window. Open shadow gaps read as dark lines.',
  params: [
    def({ key: 'course', label: 'Course height', unit: 'mm', min: 200, max: 600, step: 10, default: 400 }),
    def({ key: 'len', label: 'Max. stone length', unit: 'mm', min: 400, max: 1500, step: 25, default: 900 }),
    def({ key: 'gap', label: 'Shadow gap', unit: 'mm', min: 5, max: 25, step: 1, default: 12 }),
    def({ key: 'thick', label: 'Stone thickness', unit: 'mm', min: 30, max: 80, step: 5, default: 40 }),
    def({ key: 'coursing', label: 'Coursing', unit: '', kind: 'select', default: 'random', options: [
      { value: 'regular', label: 'Regular ashlar' }, { value: 'random', label: 'Random ashlar' }] }),
    def({ key: 'bond', label: 'Bond offset', unit: '%', min: 20, max: 50, step: 1, default: 33 }),
  ],
  palettes: [
    { name: 'Dholpur sandstone', primary: '#d8bf98', secondary: '#c9ad84', accent: '#e3cfab' },
    { name: 'Kota grey', primary: '#9fa39b', secondary: '#8d9189', accent: '#b2b5ad' },
    { name: 'Jaisalmer gold', primary: '#d9b46f', secondary: '#c8a160', accent: '#e4c584' },
  ],
  generate(face, openings, levels, orient, params, palette) {
    const c = new Ctx(stone, face, openings, levels, orient, params, palette);
    const random = c.str('coursing') === 'random';
    const maxL = c.m('len');
    const gap = c.m('gap');
    const T = c.m('thick') * c.clim(0.9, 1.5);
    const bond = c.pct('bond');
    const rnd = rng(17 + face.width * 100);
    // dark backing reads the shadow gaps
    for (const r of c.solid({ x0: 0, x1: c.width, y0: c.bottom, y1: c.top }, 0)) {
      c.add({ kind: 'box', role: 'solid', fill: shade(palette.primary, 0.62), u: r.x0, z: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0, d0: 0, d1: 0.004 });
    }
    const courses = coursesBetween(c.datums(), c.m('course'), random, Math.round(face.width * 31));
    const opens = c.openRects(0);
    const sizes = new Map<string, number>();
    let count = 0, area = 0;
    courses.forEach(([z0, z1], k) => {
      for (const [a, b] of freeIntervals(0, c.width, z0, z1, opens)) {
        const span = b - a;
        let u = a;
        // regular: fixed length with bond offset; random: varied lengths
        let first = random ? maxL * (0.4 + rnd() * 0.6) : maxL * (k % 2 ? 1 - bond : 1);
        while (u < b - 1e-6) {
          let L = u === a ? first : random ? maxL * (0.5 + rnd() * 0.5) : maxL;
          if (b - (u + L) < 0.2 * maxL) L = b - u;          // absorb short remainder
          if (L > maxL * 1.25 && span > maxL) L = (b - u) / 2; // split an over-long last stone
          const sx0 = u + gap / 2, sx1 = Math.min(b, u + L) - gap / 2;
          if (sx1 - sx0 > 0.04) {
            const tone = random ? mix(palette.primary, rnd() < 0.5 ? palette.secondary : palette.accent, rnd() * 0.7) : palette.primary;
            c.add({ kind: 'box', role: 'solid', fill: tone, u: sx0, z: z0 + gap / 2, w: sx1 - sx0, h: z1 - z0 - gap, d0: 0.004, d1: 0.004 + T });
            const key = `${Math.round((z1 - z0) * 100) * 10}`;
            sizes.set(key, (sizes.get(key) ?? 0) + 1);
            count++;
            area += (sx1 - sx0) * (z1 - z0 - gap);
          }
          u += L;
          first = 0;
        }
      }
    });
    for (const [h, n] of [...sizes.entries()].sort((x, y) => Number(x[0]) - Number(y[0]))) {
      c.row('Ashlar stone', `course ${h} × ${Math.round(T * 1000)} thk`, palette.name, n, 0);
    }
    c.row('Stone cladding (net)', `${Math.round(T * 1000)} thk`, palette.name, count, area, 'm²');
    c.row('Stainless anchor', 'SS 316 dowel + bracket', 'Stainless steel', count * 4, 0);
    c.notes.push(`${courses.length} courses set out from ${c.datums().length} datums.`);
    return c.finish();
  },
};
