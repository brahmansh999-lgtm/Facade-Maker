import type { FacadeType } from './types.ts';
import { BAND, Ctx, def, screenZones } from './kit.ts';
import { overlap } from '../geometry/rect.ts';

const SEG = 0.3;

export const ribbons: FacadeType = {
  id: 'ribbons',
  num: 8,
  name: 'Wave ribbons',
  description: 'Horizontal aluminium ribbons on CNC-cut fins, each one rippling in and out from the wall as a travelling wave. Ribbon pitch opens up in front of windows; ribbons stop short of doors.',
  params: [
    def({ key: 'height', label: 'Ribbon height', unit: 'mm', min: 60, max: 300, step: 5, default: 140 }),
    def({ key: 'pitch', label: 'Pitch', unit: 'mm', min: 200, max: 800, step: 10, default: 600 }),
    def({ key: 'amp', label: 'Wave amplitude', unit: 'mm', min: 0, max: 700, step: 10, default: 320 }),
    def({ key: 'length', label: 'Wavelength', unit: 'mm', min: 1500, max: 9000, step: 100, default: 4200 }),
    def({ key: 'phase', label: 'Phase per ribbon', unit: '°', min: 0, max: 60, step: 1, default: 14 }),
    def({ key: 'offset', label: 'Min. offset', unit: 'mm', min: 100, max: 400, step: 10, default: 160 }),
  ],
  palettes: [
    { name: 'Gloss white', primary: '#f1f0ec', secondary: '#dcdbd6', accent: '#8f9295' },
    { name: 'Brushed titanium', primary: '#b7b3aa', secondary: '#9c988f', accent: '#6c6a66' },
    { name: 'Electric copper', primary: '#c27a4e', secondary: '#a8653f', accent: '#5f5049' },
  ],
  generate(face, openings, levels, orient, params, palette) {
    const c = new Ctx(ribbons, face, openings, levels, orient, params, palette);
    const h = c.m('height');
    const pitch0 = Math.max(h * 1.4, c.m('pitch') * c.clim(1.15, 0.85));
    const amp = c.m('amp') * c.clim(0.85, 1.25);
    const lam = c.m('length');
    const ph = (c.num('phase') * Math.PI) / 180;
    const off = c.m('offset');
    const doors = c.doorRects(0.12);
    const d = (u: number, k: number) => off + (amp / 2) * (1 + Math.sin((u / lam) * Math.PI * 2 + k * ph));
    let ribbons_ = 0, segs = 0, len = 0;
    let k = 0;
    for (const zn of screenZones(c)) {
      let z = zn.z0 + 0.08;
      while (z + h < zn.z1 - 0.02) {
        let pitch = pitch0;
        const need = c.req({ x0: 0, x1: c.width, y0: z, y1: z + pitch });
        if (need > 0) pitch = Math.max(pitch, h / Math.max(0.05, 1 - need - 0.03));
        const por = 1 - h / pitch;
        const n = Math.ceil(c.width / SEG);
        for (let i = 0; i < n; i++) {
          const ua = (c.width * i) / n, ub = (c.width * (i + 1)) / n;
          if (doors.some((r) => overlap(r, { x0: ua, x1: ub, y0: z, y1: z + h }) > 0)) continue;
          const da = d(ua, k), db = d(ub, k);
          c.add({ kind: 'facet', role: 'screen', porosity: por, fill: palette.primary, pts: [[ua, z, da], [ub, z, db], [ub, z + h, db], [ua, z + h, da]] });
          segs++;
        }
        ribbons_++;
        len += c.width;
        k++;
        z += pitch;
      }
    }
    // CNC fins on the grid carry the ribbons back to the slab bands
    for (const u of c.lines) {
      const uc = Math.max(0.03, Math.min(c.width - 0.03, u));
      for (const b of c.bands) {
        if (b.kind !== 'floor' && b.kind !== 'roof') continue;
        c.add({ kind: 'box', role: 'solid', fill: palette.accent, u: uc - 0.03, w: 0.06, z: b.z0 + 0.05, h: BAND - 0.1, d0: 0, d1: off + amp });
      }
    }
    c.row('Aluminium ribbon', `${Math.round(h * 1000)} × 3, wave ±${Math.round((amp / 2) * 1000)}`, palette.name, ribbons_, 0);
    c.row('Ribbon (length)', `${Math.round(h * 1000)} × 3`, palette.name, len, 0, 'm');
    c.row('CNC carrier fin', '60 thk', 'Aluminium plate', c.lines.length * (face.levels.length), 0);
    c.notes.push(`${ribbons_} ribbons, ${segs} segments, wavelength ${Math.round(lam * 1000)} mm.`);
    return c.finish();
  },
};
