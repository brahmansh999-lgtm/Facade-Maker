import type { FacadeType } from './types.ts';
import { Ctx, def, freeIntervals, sz } from './kit.ts';
import { subtract1D } from '../geometry/rect.ts';

const octagon = (cu: number, cd: number, r: number): [number, number][] => {
  const pts: [number, number][] = [];
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) / 8) * Math.PI * 2;
    pts.push([cu + Math.cos(a) * r, cd + Math.sin(a) * r]);
  }
  return pts;
};

export const baguettes: FacadeType = {
  id: 'baguettes',
  num: 10,
  name: 'Terracotta baguettes',
  description: 'Extruded terracotta baguettes clipped to aluminium rails. Spacing varies across the face (vertical) or with height (horizontal, closer at eye level); in front of windows spacing opens so free area ≥ the opening’s requirement.',
  params: [
    def({ key: 'orient', label: 'Orientation', unit: '', kind: 'select', default: 'vertical', options: [
      { value: 'vertical', label: 'Vertical' }, { value: 'horizontal', label: 'Horizontal' }] }),
    def({ key: 'section', label: 'Section', unit: 'mm', min: 30, max: 80, step: 5, default: 50 }),
    def({ key: 'shape', label: 'Shape', unit: '', kind: 'select', default: 'round', options: [
      { value: 'round', label: 'Round' }, { value: 'square', label: 'Square' }] }),
    def({ key: 'spacing', label: 'Base spacing', unit: 'mm', min: 60, max: 300, step: 5, default: 110 }),
    def({ key: 'vary', label: 'Density variation', unit: '%', min: 0, max: 80, step: 1, default: 40 }),
    def({ key: 'offset', label: 'Offset from wall', unit: 'mm', min: 50, max: 300, step: 10, default: 120 }),
    def({ key: 'rail', label: 'Rail spacing', unit: 'mm', min: 600, max: 1500, step: 50, default: 1000 }),
  ],
  palettes: [
    { name: 'Natural terracotta', primary: '#c0714f', secondary: '#a95f41', accent: '#8d8a84' },
    { name: 'Honey glaze', primary: '#d2a160', secondary: '#bb8a4e', accent: '#8f8a80' },
    { name: 'Grey-green glaze', primary: '#8f9a88', secondary: '#7a8574', accent: '#6f6e69' },
  ],
  generate(face, openings, levels, orient, params, palette) {
    const c = new Ctx(baguettes, face, openings, levels, orient, params, palette);
    const t = c.m('section');
    const round = c.str('shape') === 'round';
    const s0 = Math.max(t * 1.3, c.m('spacing') * c.clim(1.2, 0.8));
    const vary = c.pct('vary');
    const off = c.m('offset');
    const doors = c.doorRects(0.1);
    const zones = [...c.storeys.map((s) => ({ z0: s.z0 + 0.05, z1: s.z1 - 0.05 })), { z0: face.roofZ + 0.05, z1: c.top - 0.05 }];
    let count = 0, len = 0, railLen = 0;
    const stick = (u0: number, u1: number, z0: number, z1: number, vertical: boolean, por: number) => {
      if (vertical) {
        const cu = (u0 + u1) / 2;
        if (round) c.add({ kind: 'prismZ', role: 'screen', porosity: por, fill: palette.primary, z0, z1, pts: octagon(cu, off + t / 2, t / 2) });
        else c.add({ kind: 'box', role: 'screen', porosity: por, fill: palette.primary, u: cu - t / 2, w: t, z: z0, h: z1 - z0, d0: off, d1: off + t });
        len += z1 - z0;
      } else {
        const cz = (z0 + z1) / 2;
        const pts = round ? octagon(cz, off + t / 2, t / 2) : ([[cz - t / 2, off], [cz + t / 2, off], [cz + t / 2, off + t], [cz - t / 2, off + t]] as [number, number][]);
        c.add({ kind: 'prismU', role: 'screen', porosity: por, fill: palette.primary, u0, u1, pts });
        len += u1 - u0;
      }
      count++;
    };
    const minSpacing = (need: number) => (need > 0 && need <= 1 ? t / Math.max(0.05, 1 - need - 0.03) : 0);

    if (c.str('orient') === 'vertical') {
      for (const z of zones) {
        let u = t;
        while (u < c.width - t) {
          const f = 0.5 + 0.5 * Math.cos((u / c.width) * Math.PI * 2);
          let sp = s0 * (1 + vary * f);
          const need = c.req({ x0: u - sp, x1: u + sp, y0: z.z0, y1: z.z1 });
          sp = Math.max(sp, minSpacing(need));
          const holes = doors.filter((d) => d.x1 > u - t && d.x0 < u + t).map((d) => [d.y0, d.y1] as [number, number]);
          for (const [a, b] of subtract1D(z.z0, z.z1, holes)) if (b - a > 0.2) stick(u - t / 2, u + t / 2, a, b, true, 1 - t / sp);
          u += sp;
        }
        // rails behind
        for (let rz = z.z0 + 0.15; rz < z.z1; rz += c.m('rail')) {
          for (const [a, b] of freeIntervals(0, c.width, rz, rz + 0.04, doors)) {
            c.add({ kind: 'box', role: 'screen', porosity: 0.95, fill: palette.accent, u: a, w: b - a, z: rz, h: 0.04, d0: off - 0.03, d1: off });
            railLen += b - a;
          }
        }
      }
    } else {
      for (const z of zones) {
        const H = z.z1 - z.z0;
        c.bays.forEach(([b0, b1]) => {
          let zz = z.z0 + t;
          while (zz < z.z1 - t) {
            const f = Math.abs((zz - z.z0) / H - 0.45) * 2; // closest at ~1.4 m
            let sp = s0 * (1 + vary * f);
            const need = c.req({ x0: b0, x1: b1, y0: zz - sp, y1: zz + sp });
            sp = Math.max(sp, minSpacing(need));
            for (const [a, b] of freeIntervals(b0 + 0.04, b1 - 0.04, zz - t / 2, zz + t / 2, doors)) stick(a, b, zz - t / 2, zz + t / 2, false, 1 - t / sp);
            zz += sp;
          }
        });
      }
      // vertical rails at grid lines
      for (const u of c.lines) {
        const uc = Math.max(0.02, Math.min(c.width - 0.02, u));
        for (const r of c.clearDoors({ x0: uc - 0.02, x1: uc + 0.02, y0: c.bottom, y1: c.top })) {
          c.add({ kind: 'box', role: 'screen', porosity: 0.95, fill: palette.accent, u: r.x0, w: r.x1 - r.x0, z: r.y0, h: r.y1 - r.y0, d0: off - 0.03, d1: off });
          railLen += r.y1 - r.y0;
        }
      }
    }
    c.row('Terracotta baguette', `${round ? 'ø' : ''}${sz(t)}${round ? '' : ' sq'}`, palette.name, count, 0);
    c.row('Terracotta baguette (length)', sz(t), palette.name, len, 0, 'm');
    c.row('Aluminium carrier rail', '40 × 30', 'Powder-coated aluminium', railLen, 0, 'm');
    return c.finish();
  },
};
