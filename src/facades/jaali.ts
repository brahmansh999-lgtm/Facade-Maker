import type { FacadeType } from './types.ts';
import { BAND, Ctx, def, freeIntervals, screenZones, sz } from './kit.ts';
import { shade } from '../drawings/color.ts';
import { rng } from '../model/units.ts';

type Bond = 'honeycomb' | 'stagger' | 'cross';
const COURSE = 0.085; // 75 brick + 10 joint
const PIER = 0.23;

export const jaali: FacadeType = {
  id: 'jaali',
  num: 1,
  name: 'Jaali brick screen',
  description: 'Half-brick perforated screen hung off the slab edge on a concrete ledge, with brick piers on the structural grid. Bond rotates storey by storey; in front of windows the bond opens up until it passes the room’s required ventilation.',
  params: [
    def({ key: 'offset', label: 'Cavity to wall', unit: 'mm', min: 150, max: 600, step: 25, default: 300 }),
    def({ key: 'perf', label: 'Perforation', unit: '%', min: 20, max: 60, step: 1, default: 38 }),
    def({ key: 'bond', label: 'Bond', unit: '', kind: 'select', default: 'rotate', options: [
      { value: 'rotate', label: 'Rotating by storey' }, { value: 'honeycomb', label: 'Honeycomb' },
      { value: 'stagger', label: 'Solid / open courses' }, { value: 'cross', label: 'Header cross' }] }),
    def({ key: 'extent', label: 'Extent', unit: '', kind: 'select', default: 'full', options: [
      { value: 'full', label: 'Full face' }, { value: 'openings', label: 'Bays with openings' }, { value: 'alternate', label: 'Alternate bays' }] }),
    def({ key: 'brick', label: 'Brick length', unit: 'mm', min: 190, max: 290, step: 10, default: 230 }),
  ],
  palettes: [
    { name: 'Wire-cut red', primary: '#b4664b', secondary: '#9d5640', accent: '#8f8a80' },
    { name: 'Kiln buff', primary: '#c8a77c', secondary: '#b8946a', accent: '#9a958c' },
    { name: 'Lime-washed', primary: '#e3ddd0', secondary: '#d4ccbc', accent: '#a9a397' },
  ],
  generate(face, openings, levels, orient, params, palette) {
    const c = new Ctx(jaali, face, openings, levels, orient, params, palette);
    const off = c.m('offset') * c.clim(0.9, 1.2);
    const basePerf = Math.min(0.6, Math.max(0.15, c.pct('perf') * c.clim(1.2, 0.8)));
    const L = c.m('brick');
    const T = 0.115;
    const bondSel = c.str('bond');
    const extent = c.str('extent');
    const rnd = rng(face.side.length * 97 + 13);
    const doors = c.doorRects(0.1);
    let bricks = 0, screenArea = 0;

    // concrete ledges at each band carry the screen
    for (const b of c.bands) {
      if (b.kind === 'plinth' || b.kind === 'parapet') continue;
      for (const r of c.solid({ x0: 0, x1: c.width, y0: b.z0, y1: b.z1 }, 0.02)) {
        c.add({ kind: 'box', role: 'solid', fill: palette.accent, u: r.x0, z: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0, d0: 0, d1: off + T + 0.03 });
      }
      c.row('RCC ledge', sz(off + T + 0.03, BAND), 'Precast concrete', c.width, 0, 'm');
    }
    // piers on grid lines
    for (const u of c.lines) {
      const u0 = Math.max(0, Math.min(c.width - PIER, u - PIER / 2));
      for (const r of c.solid({ x0: u0, x1: u0 + PIER, y0: c.bottom, y1: c.top }, 0.02)) {
        c.add({ kind: 'box', role: 'solid', fill: shade(palette.primary, 0.08), u: r.x0, z: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0, d0: off, d1: off + T });
        c.row('Brick pier', sz(PIER, T), 'Brick, ' + palette.name, 1, 0);
      }
    }

    const zones = screenZones(c);
    zones.forEach((zn) => {
      const bond: Bond = bondSel === 'rotate' ? (['honeycomb', 'stagger', 'cross'] as Bond[])[zn.index % 3] : (bondSel as Bond);
      c.bays.forEach(([b0, b1], bi) => {
        if (extent === 'alternate' && bi % 2 === 1) return;
        if (extent === 'openings' && !c.openings.some((o) => o.u1 > b0 && o.u0 < b1 && o.z0 < zn.z1 && o.z1 > zn.z0)) return;
        const u0 = b0 + PIER / 2 + (bi === 0 ? PIER / 2 : 0);
        const u1 = b1 - PIER / 2 - (bi === c.bays.length - 1 ? PIER / 2 : 0);
        if (u1 - u0 < 0.3) return;
        const courses = Math.floor((zn.z1 - zn.z0) / COURSE);
        screenArea += (u1 - u0) * (zn.z1 - zn.z0);
        for (let k = 0; k < courses; k++) {
          const z = zn.z0 + k * COURSE;
          const rect = { x0: u0, x1: u1, y0: z, y1: z + COURSE };
          const need = c.req(rect);
          // per-course pattern
          let unit = L, perfC = basePerf, solidCourse = false;
          if (bond === 'stagger') { solidCourse = k % 2 === 0; perfC = Math.min(0.7, basePerf * 2); }
          if (bond === 'cross') { unit = T; solidCourse = k % 4 === 3; perfC = Math.min(0.7, basePerf * 1.33); }
          // open the bond in front of openings until it passes the required ventilation
          if (need > 0 && need <= 1) {
            if (bond === 'stagger') { solidCourse = false; }
            if (bond === 'cross') solidCourse = false;
            perfC = Math.max(perfC, Math.min(0.85, need + 0.06));
          }
          const gap = solidCourse ? 0.01 : (unit * perfC) / (1 - perfC);
          const pitch = unit + gap;
          const shift = bond === 'cross' ? ((k % 2) * pitch) / 2 : ((k % 2) * pitch) / 2;
          const porosity = solidCourse ? 0.04 : gap / pitch;
          for (const [a, b] of freeIntervals(u0, u1, z, z + COURSE, doors)) {
            for (let s = a - shift; s < b - 1e-6; s += pitch) {
              const bu0 = Math.max(a, s), bu1 = Math.min(b, s + unit);
              if (bu1 - bu0 < 0.03) continue;
              c.add({
                kind: 'box', role: 'screen', porosity, fill: rnd() < 0.18 ? palette.secondary : palette.primary,
                u: bu0, z: z + 0.005, w: bu1 - bu0, h: 0.075, d0: off, d1: off + T,
              });
              bricks++;
            }
          }
        }
      });
    });
    c.row('Brick, laid as jaali', sz(L, T, 0.075), 'Brick, ' + palette.name, bricks, 0);
    c.row('Jaali screen (gross)', '115 thk', 'Brick in 1:4 cement mortar', 1, screenArea, 'm²');
    c.notes.push(`Screen ${Math.round(off * 1000)} mm off the wall; ${Math.round(basePerf * 100)}% open, opening up in front of glazing.`);
    return c.finish();
  },
};
