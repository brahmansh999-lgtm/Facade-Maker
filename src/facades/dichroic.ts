import type { FacadeType } from './types.ts';
import { Ctx, def, screenZones, sz } from './kit.ts';
import { subtract1D } from '../geometry/rect.ts';
import { lerp } from '../model/units.ts';
import { mix } from '../drawings/color.ts';

const T = 0.024;

export const dichroic: FacadeType = {
  id: 'dichroic',
  num: 10,
  name: 'Dichroic glass fins',
  description: 'Laminated dichroic glass blades in stainless shoes at every slab band. Colour shifts across the face and with viewing angle; the blades twist from end to end. Fins straighten or drop out in front of windows to keep the free area.',
  params: [
    def({ key: 'spacing', label: 'Spacing', unit: 'mm', min: 300, max: 1200, step: 25, default: 900 }),
    def({ key: 'depth', label: 'Blade depth', unit: 'mm', min: 200, max: 700, step: 10, default: 420 }),
    def({ key: 'rot0', label: 'Twist at left', unit: '°', min: -60, max: 60, step: 1, default: -25 }),
    def({ key: 'rot1', label: 'Twist at right', unit: '°', min: -60, max: 60, step: 1, default: 35 }),
    def({ key: 'offset', label: 'Offset from wall', unit: 'mm', min: 50, max: 300, step: 10, default: 120 }),
    def({ key: 'tint', label: 'Tint strength', unit: '%', min: 10, max: 90, step: 1, default: 55 }),
  ],
  palettes: [
    { name: 'Cyan → magenta', primary: '#55c3d6', secondary: '#c65bb3', accent: '#9aa3a8' },
    { name: 'Gold → violet', primary: '#e0b64e', secondary: '#7a5bc6', accent: '#9a968e' },
    { name: 'Low-iron clear', primary: '#d8e6e4', secondary: '#bcd3d0', accent: '#a0a6a8' },
  ],
  generate(face, openings, levels, orient, params, palette) {
    const c = new Ctx(dichroic, face, openings, levels, orient, params, palette);
    const spacing = Math.max(0.2, c.m('spacing') * c.clim(1.2, 0.8));
    const depth = c.m('depth');
    const r0 = c.num('rot0'), r1 = c.num('rot1');
    const off = c.m('offset');
    const op = 1 - c.pct('tint') * 0.75;
    const doors = c.doorRects(0.1);
    const us: number[] = [];
    c.bays.forEach(([a, b], i) => {
      const n = Math.max(1, Math.round((b - a) / spacing));
      for (let k = i === 0 ? 0 : 1; k <= n; k++) us.push(a + ((b - a) * k) / n);
    });
    let n = 0, area = 0, dropped = 0;
    for (const u of us) {
      const uc = Math.min(c.width - T, Math.max(T, u));
      const t = uc / c.width;
      const fill = mix(palette.primary, palette.secondary, t);
      for (const zn of screenZones(c)) {
        const holes = doors.filter((d) => d.x1 > uc - depth && d.x0 < uc + depth).map((d) => [d.y0, d.y1] as [number, number]);
        for (const [z0, z1] of subtract1D(zn.z0 + 0.04, zn.z1 - 0.04, holes)) {
          if (z1 - z0 < 0.3) continue;
          let rot = lerp(r0, r1, t);
          const proj = (a: number) => T * Math.abs(Math.cos((a * Math.PI) / 180)) + depth * Math.abs(Math.sin((a * Math.PI) / 180));
          const need = c.req({ x0: uc - proj(rot) / 2, x1: uc + proj(rot) / 2, y0: z0, y1: z1 });
          let por = 1 - proj(rot) / spacing;
          if (need > 0) {
            for (const tr of [rot, rot / 2, 0]) { rot = tr; por = 1 - proj(rot) / spacing; if (por >= need) break; }
            if (por < need) { dropped++; continue; }
          }
          c.add({ kind: 'box', role: 'screen', porosity: por, fill, opacity: op, u: uc - T / 2, w: T, z: z0, h: z1 - z0, d0: off, d1: off + depth, rot });
          n++;
          area += depth * (z1 - z0);
        }
      }
    }
    // stainless shoes along the bands
    for (const b of c.bands) {
      if (b.kind !== 'floor' && b.kind !== 'roof') continue;
      for (const r of c.solid({ x0: 0, x1: c.width, y0: b.z0 + 0.1, y1: b.z1 - 0.1 }, 0.02)) {
        c.add({ kind: 'box', role: 'solid', fill: palette.accent, u: r.x0, z: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0, d0: 0, d1: off + 0.06 });
      }
    }
    c.row('Dichroic glass blade', `${sz(depth)} × 12.12 laminated`, palette.name, n, area, 'm²');
    c.row('Blade shoe', 'SS 316 clamp', 'Stainless steel', n * 2, 0);
    if (dropped) c.notes.push(`${dropped} blade run(s) omitted in front of glazing to keep the free area.`);
    return c.finish();
  },
};
