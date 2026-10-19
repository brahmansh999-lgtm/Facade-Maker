import type { FacadeType } from './types.ts';
import { Ctx, def, sz } from './kit.ts';
import { overlap, subtract1D } from '../geometry/rect.ts';
import { rng } from '../model/units.ts';
import { mix } from '../drawings/color.ts';

export const green: FacadeType = {
  id: 'green',
  num: 14,
  name: 'Green facade: cables + planters',
  description: 'Precast planter ledges cantilever off every slab band (and a bed at plinth). Stainless cables run between them on the grid rhythm; climbers grow up (or trail down) the cables and are trained away from windows and doors.',
  params: [
    def({ key: 'cable', label: 'Cable spacing', unit: 'mm', min: 300, max: 1200, step: 25, default: 600 }),
    def({ key: 'pdepth', label: 'Planter depth', unit: 'mm', min: 300, max: 900, step: 25, default: 500 }),
    def({ key: 'pheight', label: 'Planter height', unit: 'mm', min: 300, max: 600, step: 25, default: 450 }),
    def({ key: 'cover', label: 'Foliage cover', unit: '%', min: 10, max: 90, step: 1, default: 55 }),
    def({ key: 'offset', label: 'Cable offset', unit: 'mm', min: 150, max: 500, step: 10, default: 300 }),
    def({ key: 'growth', label: 'Growth', unit: '', kind: 'select', default: 'climbing', options: [
      { value: 'climbing', label: 'Climbing' }, { value: 'cascading', label: 'Cascading' }] }),
  ],
  palettes: [
    { name: 'Monsoon green', primary: '#6f8a5a', secondary: '#58744a', accent: '#b6b1a6' },
    { name: 'Bougainvillea', primary: '#7a8e5c', secondary: '#b55a7a', accent: '#c2b9aa' },
    { name: 'Silver creeper', primary: '#8fa08a', secondary: '#7a8c76', accent: '#9f9a91' },
  ],
  generate(face, openings, levels, orient, params, palette) {
    const c = new Ctx(green, face, openings, levels, orient, params, palette);
    const spacing = c.m('cable');
    const pd = c.m('pdepth');
    const ph = c.m('pheight');
    const cover = Math.min(0.95, c.pct('cover') * c.clim(0.8, 1.25));
    const off = c.m('offset');
    const climbing = c.str('growth') === 'climbing';
    const rnd = rng(7 + Math.round(face.width * 10));
    const doors = c.doorRects(0.3);
    const keepClear = c.openRects(0.12);
    // planters: plinth bed + one ledge per slab band, hung below the slab top
    const ledges: { z0: number; z1: number }[] = [{ z0: 0, z1: c.bottom }];
    for (const l of face.levels.slice(1)) ledges.push({ z0: l.ffl - ph, z1: l.ffl + 0.05 });
    ledges.push({ z0: face.roofZ - ph, z1: face.roofZ + 0.05 });
    let pl = 0;
    for (const L of ledges) {
      for (const r of c.solid({ x0: 0, x1: c.width, y0: L.z0, y1: L.z1 }, 0.03)) {
        if (doors.some((d) => overlap(d, r) > 0)) continue;
        for (const [a, b] of subtract1D(r.x0, r.x1, doors.filter((d) => d.y0 < L.z1 && d.y1 > L.z0).map((d) => [d.x0, d.x1]))) {
          c.add({ kind: 'box', role: 'solid', fill: palette.accent, u: a, w: b - a, z: L.z0, h: L.z1 - L.z0, d0: 0, d1: pd });
          // soil/plant line
          c.add({ kind: 'box', role: 'solid', fill: palette.secondary, u: a + 0.03, w: b - a - 0.06, z: L.z1, h: 0.06, d0: 0.05, d1: pd - 0.05 });
          pl += b - a;
        }
      }
    }
    // cables: subdivide each bay, run from ledge to ledge
    const us: number[] = [];
    c.bays.forEach(([a, b]) => {
      const n = Math.max(1, Math.round((b - a) / spacing));
      for (let k = 0; k < n; k++) us.push(a + ((b - a) * (k + 0.5)) / n);
    });
    let cables = 0, cableLen = 0, plants = 0;
    for (let i = 0; i < ledges.length - 1; i++) {
      const z0 = ledges[i].z1, z1 = ledges[i + 1].z0;
      for (const u of us) {
        const holes = doors.filter((d) => d.x0 < u && d.x1 > u).map((d) => [d.y0, d.y1] as [number, number]);
        for (const [a, b] of subtract1D(z0, z1, holes)) {
          if (b - a < 0.4) continue;
          c.add({ kind: 'line', role: 'screen', porosity: 0.99, fill: '#6b6e70', width: 0.006, pts: [[u, a, off], [u, b, off]] });
          cables++; cableLen += b - a;
          // foliage along the cable, trained clear of openings
          const reach = (b - a) * cover;
          const n = Math.round(reach / 0.16);
          for (let k = 0; k < n; k++) {
            const t = climbing ? a + (k / Math.max(1, n)) * reach : b - (k / Math.max(1, n)) * reach;
            const r = 0.1 + rnd() * 0.14 * (1 - Math.abs(t - (climbing ? a : b)) / (b - a + 0.01) * 0.5);
            const du = (rnd() - 0.5) * 0.35;
            const disc = { x0: u + du - r, x1: u + du + r, y0: t - r, y1: t + r };
            if (keepClear.some((q) => overlap(q, disc) > 0)) continue;
            c.add({ kind: 'disc', role: 'screen', porosity: 0.5, fill: mix(palette.primary, palette.secondary, rnd() * (palette.name === 'Bougainvillea' ? 0.9 : 0.5)), u: u + du, z: t, r, d: off + 0.02 + rnd() * 0.12 });
          }
          plants++;
        }
      }
    }
    c.row('Precast planter ledge', sz(pd, ph), palette.name === 'Silver creeper' ? 'Grey precast' : 'Buff precast', pl, 0, 'm');
    c.row('Planting medium', '', 'Lightweight substrate', 1, pl * pd, 'm²');
    c.row('Stainless cable', 'ø4 with tensioners', 'SS 316', cables, 0);
    c.row('Stainless cable (length)', 'ø4', 'SS 316', cableLen, 0, 'm');
    c.row('Climber', climbing ? 'Climbing' : 'Trailing', palette.name, plants, 0);
    return c.finish();
  },
};
