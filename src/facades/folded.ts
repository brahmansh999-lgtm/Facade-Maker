import type { FacadeType } from './types.ts';
import { BAND, Ctx, def, sz } from './kit.ts';
import { shade } from '../drawings/color.ts';

const BASE = 0.02;

export const folded: FacadeType = {
  id: 'folded',
  num: 11,
  name: 'Folded metal cladding',
  description: 'Pleated aluminium or zinc cassettes on a rail system, storey- or half-storey high, folds vertical or horizontal. Openings are trimmed with pressed head and sill flashings so the pleats return cleanly.',
  params: [
    def({ key: 'fold', label: 'Fold width', unit: 'mm', min: 100, max: 600, step: 10, default: 300 }),
    def({ key: 'angle', label: 'Fold angle', unit: '°', min: 15, max: 60, step: 1, default: 35 }),
    def({ key: 'dir', label: 'Fold direction', unit: '', kind: 'select', default: 'vertical', options: [
      { value: 'vertical', label: 'Vertical pleats' }, { value: 'horizontal', label: 'Horizontal pleats' }] }),
    def({ key: 'height', label: 'Panel height', unit: '', kind: 'select', default: 'storey', options: [
      { value: 'storey', label: 'Storey' }, { value: 'half', label: 'Half storey' }] }),
    def({ key: 'flash', label: 'Flashing depth', unit: 'mm', min: 20, max: 100, step: 5, default: 50 }),
    def({ key: 'pattern', label: 'Pattern', unit: '', kind: 'select', default: 'uniform', options: [
      { value: 'uniform', label: 'Uniform' }, { value: 'alternate', label: 'Alternate by panel' }] }),
  ],
  palettes: [
    { name: 'Pre-weathered zinc', primary: '#8f9496', secondary: '#7b8083', accent: '#5f6365' },
    { name: 'Champagne anodised', primary: '#c3b293', secondary: '#ad9d80', accent: '#7f7462' },
    { name: 'Mirror stainless', primary: '#d6d9db', secondary: '#9ea3a7', accent: '#5d6266' },
  ],
  generate(face, openings, levels, orient, params, palette) {
    const c = new Ctx(folded, face, openings, levels, orient, params, palette);
    const fw = c.m('fold');
    const ang0 = Math.min(65, c.num('angle') * c.clim(0.85, 1.25));
    const vertical = c.str('dir') === 'vertical';
    const half = c.str('height') === 'half';
    const flash = c.m('flash');
    const alt = c.str('pattern') === 'alternate';
    const breaks: number[] = [c.bottom];
    for (const l of face.levels.slice(1)) breaks.push(l.ffl - BAND);
    breaks.push(face.roofZ - BAND, c.top);
    const rows: [number, number][] = [];
    for (let i = 0; i < breaks.length - 1; i++) {
      const [a, b] = [breaks[i], breaks[i + 1]];
      if (half && b - a > 2) rows.push([a, (a + b) / 2], [(a + b) / 2, b]); else rows.push([a, b]);
    }
    let area = 0, dev = 0, panels = 0, maxAmp = 0;
    const zig = (a: number, b: number, amp: number, phase: number): [number, number][] => {
      const pts: [number, number][] = [];
      const hs = fw / 2;
      let k = Math.ceil((b - phase) / hs);
      for (let x = phase + k * hs; x > a + 1e-6; x -= hs, k--) if (x < b - 1e-6) pts.push([x, BASE + (k % 2 === 0 ? 0 : amp)]);
      return pts;
    };
    rows.forEach(([z0, z1], ri) => {
      c.bays.forEach(([b0, b1], bi) => {
        const amp = (fw / 2) * Math.tan((((alt && (ri + bi) % 2) ? ang0 * 0.6 : ang0) * Math.PI) / 180);
        maxAmp = Math.max(maxAmp, amp);
        const rect = { x0: b0 + 0.006, x1: b1 - 0.006, y0: z0 + 0.006, y1: z1 - 0.006 };
        panels++;
        for (const r of c.solid(rect, 0.03)) {
          if (vertical) {
            const front: [number, number][] = [[r.x1, BASE + amp / 2], ...zig(r.x0, r.x1, amp, b0), [r.x0, BASE + amp / 2]];
            c.add({ kind: 'prismZ', role: 'solid', fill: palette.primary, z0: r.y0, z1: r.y1, pts: [[r.x0, 0], [r.x1, 0], ...front] });
          } else {
            const front: [number, number][] = [[r.y1, BASE + amp / 2], ...zig(r.y0, r.y1, amp, z0), [r.y0, BASE + amp / 2]];
            c.add({ kind: 'prismU', role: 'solid', fill: palette.primary, u0: r.x0, u1: r.x1, pts: [[r.y0, 0], [r.y1, 0], ...front] });
          }
          const a = (r.x1 - r.x0) * (r.y1 - r.y0);
          area += a;
          dev += a / Math.cos((ang0 * Math.PI) / 180);
        }
      });
    });
    // flashings around openings
    let fl = 0;
    for (const o of c.openings) {
      const d1 = BASE + maxAmp + flash;
      const parts = [
        { x0: o.u0 - 0.06, x1: o.u1 + 0.06, y0: o.z1, y1: o.z1 + 0.04 },
        ...(o.door ? [] : [{ x0: o.u0 - 0.06, x1: o.u1 + 0.06, y0: o.z0 - 0.04, y1: o.z0 }]),
        { x0: o.u0 - 0.03, x1: o.u0, y0: o.z0, y1: o.z1 },
        { x0: o.u1, x1: o.u1 + 0.03, y0: o.z0, y1: o.z1 },
      ];
      for (const p of parts) for (const r of c.solid(p, 0)) {
        c.add({ kind: 'box', role: 'solid', fill: shade(palette.accent, 0.05), u: r.x0, z: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0, d0: 0, d1: d1 });
      }
      fl += 2 * (o.u1 - o.u0) + 2 * (o.z1 - o.z0);
    }
    c.row('Folded cassette', `${Math.round(fw * 1000)} pleat @ ${ang0.toFixed(0)}°`, palette.name, panels, area, 'm²');
    c.row('Developed sheet area', '1.0 thk', palette.name, 1, dev, 'm²');
    c.row('Pressed flashing', sz(maxAmp + flash), palette.name, fl, 0, 'm');
    return c.finish();
  },
};
