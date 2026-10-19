import type { FacadeType } from './types.ts';
import { Ctx, def } from './kit.ts';
import { overlap } from '../geometry/rect.ts';
import { rng } from '../model/units.ts';
import { ramp } from './voronoi.ts';

export const mosaic: FacadeType = {
  id: 'mosaic',
  num: 6,
  name: 'Gradient mosaic',
  description: 'Large glazed ceramic tiles in a colour gradient that sweeps across the house, each tile pivoted a few degrees so the surface shimmers as you walk past. Tiles step neatly around every opening.',
  params: [
    def({ key: 'tile', label: 'Tile size', unit: 'mm', min: 300, max: 1200, step: 25, default: 600 }),
    def({ key: 'joint', label: 'Joint', unit: 'mm', min: 5, max: 60, step: 1, default: 18 }),
    def({ key: 'tilt', label: 'Pivot', unit: '°', min: 0, max: 30, step: 1, default: 10 }),
    def({ key: 'flow', label: 'Gradient', unit: '', kind: 'select', default: 'diagonal', options: [
      { value: 'diagonal', label: 'Diagonal' }, { value: 'vertical', label: 'Ground to sky' }, { value: 'horizontal', label: 'End to end' }, { value: 'radial', label: 'From the entrance' }] }),
    def({ key: 'noise', label: 'Pixel noise', unit: '%', min: 0, max: 60, step: 1, default: 18 }),
    def({ key: 'offset', label: 'Offset from wall', unit: 'mm', min: 30, max: 200, step: 5, default: 60 }),
  ],
  palettes: [
    { name: 'Sunset', primary: '#ffb26b', secondary: '#ff5e78', accent: '#6a4c93' },
    { name: 'Ocean', primary: '#c7f9cc', secondary: '#38a3a5', accent: '#22577a' },
    { name: 'Prism', primary: '#ffd166', secondary: '#06d6a0', accent: '#118ab2' },
  ],
  generate(face, openings, levels, orient, params, palette) {
    const c = new Ctx(mosaic, face, openings, levels, orient, params, palette);
    const T = c.m('tile');
    const j = c.m('joint');
    const tilt = (c.num('tilt') * Math.PI) / 180 * c.clim(0.8, 1.3);
    const flow = c.str('flow');
    const noise = c.pct('noise');
    const off = c.m('offset');
    const rnd = rng(31 + Math.round(face.width * 19));
    const opens = [...c.openRects(0.04), ...c.doorRects(0.06)];
    const H = c.top - c.bottom;
    const door = c.openings.find((o) => o.door);
    const fx = door ? (door.u0 + door.u1) / 2 : c.width / 2;
    let n = 0, a = 0;
    for (let z = c.bottom; z + T * 0.3 < c.top; z += T) {
      for (let u = 0; u + T * 0.3 < c.width; u += T) {
        const u1 = Math.min(c.width, u + T) - j / 2, z1 = Math.min(c.top, z + T) - j / 2;
        const u0 = u + j / 2, z0 = z + j / 2;
        if (u1 - u0 < 0.08 || z1 - z0 < 0.08) continue;
        if (opens.some((o) => overlap(o, { x0: u0, x1: u1, y0: z0, y1: z1 }) > 0)) continue;
        const tu = (u0 + u1) / 2 / c.width, tz = ((z0 + z1) / 2 - c.bottom) / H;
        const t = flow === 'vertical' ? tz : flow === 'horizontal' ? tu : flow === 'radial' ? Math.min(1, Math.hypot((u0 + u1) / 2 - fx, (z0 + z1) / 2 - c.bottom) / Math.max(c.width, H))
          : tu * 0.5 + tz * 0.5;
        const fill = ramp(palette, t + (rnd() - 0.5) * noise);
        // pivot about the left edge; alternate rows lean the other way for a woven shimmer
        const lean = Math.tan(tilt) * (u1 - u0) * (((Math.round(z / T) + Math.round(u / T)) % 2) ? 1 : 0.35);
        c.add({ kind: 'facet', role: 'solid', fill, pts: [[u0, z0, off], [u1, z0, off + lean], [u1, z1, off + lean], [u0, z1, off]] });
        n++;
        a += (u1 - u0) * (z1 - z0);
      }
    }
    c.row('Glazed ceramic tile, pivoted', `${Math.round(T * 1000)} sq, ${Math.round((tilt * 180) / Math.PI)}°`, palette.name, n, 0);
    c.row('Tile area', '12 mm porcelain', palette.name, 1, a, 'm²');
    c.row('Hidden clip rail', 'Al T-rail', 'Aluminium', Math.ceil(c.width / 0.6), 0);
    c.notes.push(`${n} tiles in a ${flow} gradient.`);
    return c.finish();
  },
};
