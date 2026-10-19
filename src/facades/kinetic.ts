import type { FacadeType } from './types.ts';
import { BAND, Ctx, def, screenZones } from './kit.ts';
import { overlap } from '../geometry/rect.ts';

export const kinetic: FacadeType = {
  id: 'kinetic',
  num: 8,
  name: 'Kinetic triangular panels',
  description: 'Triangular PTFE-mesh panels hinged on horizontal rails, folding outward like an origami screen. Opening angle follows the sun or a wave field; in front of glazing panels open further until the free area is met.',
  params: [
    def({ key: 'size', label: 'Triangle side', unit: 'mm', min: 800, max: 2400, step: 50, default: 1400 }),
    def({ key: 'angle', label: 'Open angle', unit: '°', min: 0, max: 70, step: 1, default: 32 }),
    def({ key: 'field', label: 'Angle field', unit: '', kind: 'select', default: 'wave', options: [
      { value: 'wave', label: 'Wave' }, { value: 'sun', label: 'Sun-driven' }, { value: 'uniform', label: 'Uniform' }] }),
    def({ key: 'offset', label: 'Rail stand-off', unit: 'mm', min: 200, max: 800, step: 10, default: 350 }),
    def({ key: 'gap', label: 'Panel gap', unit: 'mm', min: 20, max: 120, step: 5, default: 50 }),
  ],
  palettes: [
    { name: 'White PTFE', primary: '#efeeea', secondary: '#dcdad4', accent: '#8e9194' },
    { name: 'Champagne mesh', primary: '#d7c7a6', secondary: '#c3b391', accent: '#7f7564' },
    { name: 'Carbon', primary: '#4a4d50', secondary: '#3a3c3f', accent: '#8a8e91' },
  ],
  generate(face, openings, levels, orient, params, palette) {
    const c = new Ctx(kinetic, face, openings, levels, orient, params, palette);
    const side0 = c.m('size');
    const a0 = (c.num('angle') * Math.PI) / 180;
    const field = c.str('field');
    const off = c.m('offset');
    const gap = c.m('gap');
    const doors = c.doorRects(0.12);
    const FILL = 0.9;
    let panels = 0, area = 0, opened = 0;
    for (const zn of screenZones(c)) {
      const H = zn.z1 - zn.z0;
      const rows = Math.max(1, Math.round(H / ((side0 * Math.sqrt(3)) / 2)));
      const h = H / rows;
      const side = (2 * h) / Math.sqrt(3);
      for (let r = 0; r < rows; r++) {
        const z0 = zn.z0 + r * h, z1 = z0 + h;
        // hinge rail
        c.add({ kind: 'line', role: 'screen', porosity: 0.98, fill: palette.accent, width: 0.02, pts: [[0, z0 + 0.01, off], [c.width, z0 + 0.01, off]] });
        const n = Math.ceil(c.width / (side / 2)) + 1;
        for (let k = 0; k < n; k++) {
          const uc = k * (side / 2);
          const up = (k + r) % 2 === 0;
          const hb = side / 2 - gap;
          const bbox = { x0: uc - side / 2, x1: uc + side / 2, y0: z0, y1: z1 };
          if (bbox.x0 < -0.01 || bbox.x1 > c.width + 0.01) continue;
          if (doors.some((d) => overlap(d, bbox) > 0)) continue;
          const fv = field === 'wave' ? 0.5 + 0.5 * Math.sin((uc / c.width) * Math.PI * 3 + zn.index * 1.1)
            : field === 'sun' ? Math.min(1, 0.25 + orient.exposure) : 1;
          let th = a0 * fv * c.clim(0.8, 1.25);
          const need = c.req(bbox);
          if (need > 0 && 1 - FILL * Math.cos(th) < need) { th = Math.acos(Math.max(0, Math.min(1, (1 - need - 0.02) / FILL))); opened++; }
          const hh = h - gap * 1.5;
          const ct = Math.cos(th), st = Math.sin(th);
          const pts: [number, number, number][] = up
            ? [[uc - hb, z0 + gap / 2, off], [uc + hb, z0 + gap / 2, off], [uc, z0 + gap / 2 + hh * ct, off + hh * st]]
            : [[uc - hb, z1 - gap / 2, off], [uc + hb, z1 - gap / 2, off], [uc, z1 - gap / 2 - hh * ct, off + hh * st]];
          c.add({ kind: 'facet', role: 'screen', porosity: 1 - FILL * ct, fill: up ? palette.primary : palette.secondary, pts });
          panels++;
          area += hb * hh;
        }
      }
    }
    for (const b of c.bands) {
      if (b.kind !== 'floor' && b.kind !== 'roof') continue;
      for (const u of c.lines) {
        const uc = Math.max(0.05, Math.min(c.width - 0.05, u));
        c.add({ kind: 'box', role: 'solid', fill: palette.accent, u: uc - 0.04, w: 0.08, z: b.z0 + 0.06, h: BAND - 0.12, d0: 0, d1: off });
      }
    }
    c.row('Triangular kinetic panel', `${Math.round(side0 * 1000)} side, PTFE on Al frame`, palette.name, panels, area, 'm²');
    c.row('Linear actuator', '24 V', 'Electromechanical', panels, 0);
    c.row('Hinge rail', 'Ø60 CHS', 'Stainless steel', 1, 0, 'm');
    c.notes.push(`${panels} panels; ${opened} opened further in front of glazing.`);
    return c.finish();
  },
};
