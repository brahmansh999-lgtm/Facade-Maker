import type { FacadeType } from './types.ts';
import { Ctx, def, freeIntervals, sz } from './kit.ts';
import { shade } from '../drawings/color.ts';

const COURSE = 0.085;

export const brick: FacadeType = {
  id: 'brick',
  num: 5,
  name: 'Exposed brick, deep bays',
  description: 'Fair-faced brick skin with every window set in a projecting brick surround so the glass sits deep in a shaded bay. Corbelled courses mark each slab and the coping; bond shows on the face.',
  params: [
    def({ key: 'reveal', label: 'Bay depth', unit: 'mm', min: 200, max: 600, step: 10, default: 350 }),
    def({ key: 'frame', label: 'Surround width', unit: 'mm', min: 115, max: 460, step: 115, default: 230 }),
    def({ key: 'steps', label: 'Corbel courses', unit: 'nr', min: 1, max: 4, step: 1, default: 3 }),
    def({ key: 'step', label: 'Corbel step', unit: 'mm', min: 15, max: 40, step: 5, default: 25 }),
    def({ key: 'bond', label: 'Bond', unit: '', kind: 'select', default: 'flemish', options: [
      { value: 'stretcher', label: 'Stretcher' }, { value: 'flemish', label: 'Flemish' }, { value: 'english', label: 'English' }] }),
    def({ key: 'sill', label: 'Sill projection', unit: 'mm', min: 0, max: 100, step: 5, default: 50 }),
  ],
  palettes: [
    { name: 'Handmade red', primary: '#b06a50', secondary: '#9c5b44', accent: '#cfc7b8' },
    { name: 'Smoked brown', primary: '#7d5a48', secondary: '#6a4a3b', accent: '#bdb3a4' },
    { name: 'Pale gault', primary: '#d6c3a0', secondary: '#c2ae8c', accent: '#e6e1d6' },
  ],
  generate(face, openings, levels, orient, params, palette) {
    const c = new Ctx(brick, face, openings, levels, orient, params, palette);
    const reveal = c.m('reveal') * c.clim(0.85, 1.35);
    const fw = c.m('frame');
    const steps = Math.round(c.num('steps'));
    const step = c.m('step');
    const bond = c.str('bond');
    const sillP = c.m('sill');
    const mortar = shade(palette.primary, 0.32);

    // brick skin (fair face) clear of openings
    const skin = c.solid({ x0: 0, x1: c.width, y0: c.bottom, y1: c.top }, 0);
    let area = 0;
    for (const r of skin) {
      c.add({ kind: 'box', role: 'solid', fill: palette.primary, u: r.x0, z: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0, d0: 0, d1: 0.012 });
      area += (r.x1 - r.x0) * (r.y1 - r.y0);
    }
    // coursing: bed joints and perpends by bond
    const opens = c.openRects(0);
    let k = 0;
    for (let z = c.bottom + COURSE; z < c.top - 1e-6; z += COURSE, k++) {
      for (const [a, b] of freeIntervals(0, c.width, z - 0.001, z + 0.001, opens)) {
        c.add({ kind: 'line', role: 'solid', fill: mortar, width: 0.008, pts: [[a, z, 0.013], [b, z, 0.013]] });
      }
      // perpends for the course below this joint
      const zc0 = z - COURSE, zc1 = z;
      const header = bond === 'english' ? k % 2 === 1 : false;
      const L = header ? 0.115 + 0.01 : 0.24;
      const fl = bond === 'flemish';
      const shift = bond === 'stretcher' ? (k % 2) * 0.12 : (k % 2) * 0.0575;
      for (const [a, b] of freeIntervals(0, c.width, zc0, zc1, opens)) {
        let u = a - shift, i = 0;
        while (u < b) {
          const len = fl ? (i % 2 ? 0.125 : 0.24) : L;
          u += len; i++;
          if (u > a + 0.02 && u < b - 0.02) c.add({ kind: 'line', role: 'solid', fill: mortar, width: 0.006, pts: [[u, zc0, 0.013], [u, zc1, 0.013]] });
        }
      }
    }
    // deep surrounds around every window (doors get a plain head)
    let frames = 0;
    for (const o of c.openings) {
      const parts = o.door
        ? [{ x0: o.u0 - fw, x1: o.u1 + fw, y0: o.z1, y1: o.z1 + fw }]
        : [
          { x0: o.u0 - fw, x1: o.u0, y0: o.z0 - fw, y1: o.z1 + fw },
          { x0: o.u1, x1: o.u1 + fw, y0: o.z0 - fw, y1: o.z1 + fw },
          { x0: o.u0, x1: o.u1, y0: o.z1, y1: o.z1 + fw },
        ];
      for (const p of parts) {
        for (const r of c.solid({ x0: Math.max(0, p.x0), x1: Math.min(c.width, p.x1), y0: p.y0, y1: Math.min(c.top, p.y1) }, 0.0)) {
          c.add({ kind: 'box', role: 'solid', fill: palette.secondary, u: r.x0, z: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0, d0: 0, d1: reveal });
        }
      }
      if (!o.door) {
        // brick-on-edge sill projecting past the bay
        for (const r of c.solid({ x0: o.u0, x1: o.u1, y0: o.z0 - 0.09, y1: o.z0 }, 0.0)) {
          c.add({ kind: 'prismU', role: 'solid', fill: shade(palette.secondary, 0.1), u0: r.x0, u1: r.x1, pts: [[r.y0, 0], [r.y0, reveal + sillP], [r.y1 - 0.02, reveal + sillP], [r.y1, 0]] });
        }
      }
      frames++;
    }
    // corbelled bands at slabs and coping
    let corbel = 0;
    for (const b of c.bands) {
      if (b.kind === 'plinth') continue;
      const zTop = b.kind === 'parapet' ? b.z1 : b.z1;
      for (let s = 0; s < steps; s++) {
        const z0 = zTop - (steps - s) * COURSE;
        for (const r of c.solid({ x0: 0, x1: c.width, y0: z0, y1: z0 + COURSE - 0.01 }, 0.0)) {
          c.add({ kind: 'box', role: 'solid', fill: s % 2 ? palette.primary : palette.secondary, u: r.x0, z: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0, d0: 0, d1: (s + 1) * step });
          corbel += r.x1 - r.x0;
        }
      }
    }
    // plinth: brick on edge, darker
    for (const r of c.solid({ x0: 0, x1: c.width, y0: 0, y1: c.bottom }, 0.0)) {
      c.add({ kind: 'box', role: 'solid', fill: shade(palette.primary, 0.25), u: r.x0, z: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0, d0: 0, d1: 0.04 });
    }
    c.row('Facing brickwork', `${bond} bond`, palette.name, 1, area, 'm²');
    c.row('Facing bricks (approx.)', sz(0.23, 0.115, 0.075), palette.name, Math.round(area * 50), 0);
    c.row('Projecting window surround', `${Math.round(fw * 1000)} wide × ${Math.round(reveal * 1000)} deep`, palette.name, frames, 0);
    c.row('Corbel course', `${steps} × ${Math.round(step * 1000)} mm`, palette.name, corbel, 0, 'm');
    return c.finish();
  },
};
