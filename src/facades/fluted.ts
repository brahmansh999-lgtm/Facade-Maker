import type { FacadeType } from './types.ts';
import { BAND, Ctx, def, sz } from './kit.ts';

const BASE = 0.03;

export const fluted: FacadeType = {
  id: 'fluted',
  num: 6,
  name: 'Fluted precast / GRC panels',
  description: 'Storey-high GRC panels hung from the slab edge; horizontal joints sit at the underside of each slab band, vertical joints on a panel module inside each structural bay. Flutes cut around openings with returned reveals.',
  params: [
    def({ key: 'flute', label: 'Flute width', unit: 'mm', min: 50, max: 300, step: 10, default: 120 }),
    def({ key: 'fdepth', label: 'Flute depth', unit: 'mm', min: 10, max: 80, step: 5, default: 35 }),
    def({ key: 'profile', label: 'Flute profile', unit: '', kind: 'select', default: 'round', options: [
      { value: 'round', label: 'Round' }, { value: 'vee', label: 'Vee' }, { value: 'square', label: 'Square' }] }),
    def({ key: 'panel', label: 'Panel width', unit: 'mm', min: 600, max: 2400, step: 50, default: 1200 }),
    def({ key: 'joint', label: 'Joint', unit: 'mm', min: 5, max: 25, step: 1, default: 12 }),
    def({ key: 'layout', label: 'Joint layout', unit: '', kind: 'select', default: 'stack', options: [
      { value: 'stack', label: 'Stack bond' }, { value: 'offset', label: 'Half offset by storey' }] }),
  ],
  palettes: [
    { name: 'Natural GRC', primary: '#cdc9c0', secondary: '#bab6ad', accent: '#8f8b83' },
    { name: 'Terracotta-tinted', primary: '#c99a7c', secondary: '#b5866a', accent: '#8a7569' },
    { name: 'Charcoal', primary: '#6f6c67', secondary: '#5d5a55', accent: '#a7a39b' },
  ],
  generate(face, openings, levels, orient, params, palette) {
    const c = new Ctx(fluted, face, openings, levels, orient, params, palette);
    const fw = c.m('flute');
    const fd = c.m('fdepth') * c.clim(0.8, 1.3);
    const prof = c.str('profile');
    const pw = c.m('panel');
    const j = c.m('joint');
    const offsetLayout = c.str('layout') === 'offset';
    // panel rows: joints at underside of each band
    const rowsZ: [number, number][] = [];
    const breaks = [c.bottom, ...face.levels.slice(1).map((l) => l.ffl - BAND), face.roofZ - BAND, c.top];
    for (let i = 0; i < breaks.length - 1; i++) rowsZ.push([breaks[i], breaks[i + 1]]);

    const surface = (u0: number, u1: number, phase: number): [number, number][] => {
      // front surface from u1 back to u0 (CCW order after the base line)
      const pts: [number, number][] = [];
      const f = (u: number) => {
        const x = (((u - phase) % fw) + fw) % fw / fw;
        if (prof === 'round') return fd * (1 - Math.sin(Math.PI * x));
        if (prof === 'vee') return fd * Math.abs(2 * x - 1);
        return x > 0.2 && x < 0.8 ? 0 : fd;
      };
      const step = prof === 'round' ? fw / 6 : prof === 'vee' ? fw / 2 : fw / 10;
      const samples: number[] = [u1];
      let u = u1 - (((u1 - phase) % step) + step) % step;
      if (u >= u1 - 1e-6) u -= step;
      for (; u > u0 + 1e-6; u -= step) samples.push(u);
      samples.push(u0);
      for (const s of samples) pts.push([s, BASE + f(s)]);
      return pts;
    };
    let panels = 0, area = 0;
    rowsZ.forEach(([z0, z1], ri) => {
      c.bays.forEach(([b0, b1]) => {
        const n = Math.max(1, Math.round((b1 - b0) / pw));
        const w = (b1 - b0) / n;
        const shift = offsetLayout && ri % 2 ? w / 2 : 0;
        const edges: number[] = [b0];
        for (let k = 1; k < n + (shift ? 1 : 0); k++) edges.push(b0 + k * w - shift);
        edges.push(b1);
        for (let k = 0; k < edges.length - 1; k++) {
          const rect = { x0: edges[k] + j / 2, x1: edges[k + 1] - j / 2, y0: z0 + j / 2, y1: z1 - j / 2 };
          if (rect.x1 - rect.x0 < 0.1) continue;
          panels++;
          for (const r of c.solid(rect, 0.0)) {
            const pts: [number, number][] = [[r.x0, 0], [r.x1, 0], ...surface(r.x0, r.x1, edges[k])];
            c.add({ kind: 'prismZ', role: 'solid', fill: palette.primary, z0: r.y0, z1: r.y1, pts });
            area += (r.x1 - r.x0) * (r.y1 - r.y0);
          }
        }
      });
    });
    c.row('Fluted GRC panel', `${Math.round(pw * 1000)} module, ${prof} flute ${Math.round(fw * 1000)}`, palette.name, panels, area, 'm²');
    c.row('Panel fixing bracket', 'SS 316', 'Stainless steel', panels * 4, 0);
    c.row('Sealant joint', sz(j), 'Low-modulus silicone', 1, 0, 'm');
    c.notes.push(`${panels} panels; joints at slab band underside, flutes ${Math.round(fd * 1000)} mm deep.`);
    return c.finish();
  },
};
