import type { FacadeType } from './types.ts';
import { Ctx, def, sz } from './kit.ts';
import { overlap, subtract1D } from '../geometry/rect.ts';
import { rng } from '../model/units.ts';
import { ramp } from './voronoi.ts';

export const baguettes: FacadeType = {
  id: 'baguettes',
  num: 5,
  name: 'Pastel terracotta baguettes',
  description: 'Slender glazed terracotta rods in quiet, earthy pastels — sage, sand and clay drifting gently along the house. Rods step forward and back in a slow wave; they pass windows only as an open screen and always stop at doors.',
  params: [
    def({ key: 'pitch', label: 'Rod spacing', unit: 'mm', min: 120, max: 500, step: 10, default: 200 }),
    def({ key: 'rod', label: 'Rod width', unit: 'mm', min: 30, max: 120, step: 5, default: 60 }),
    def({ key: 'depth', label: 'Rod depth', unit: 'mm', min: 40, max: 200, step: 5, default: 70 }),
    def({ key: 'wave', label: 'Depth wave', unit: 'mm', min: 0, max: 400, step: 10, default: 160 }),
    def({ key: 'blend', label: 'Colour drift', unit: '%', min: 0, max: 100, step: 1, default: 60 }),
    def({ key: 'offset', label: 'Stand-off', unit: 'mm', min: 80, max: 400, step: 10, default: 150 }),
  ],
  palettes: [
    { name: 'Sage & sand', primary: '#b7c2a4', secondary: '#d9cbb0', accent: '#c9a593' },
    { name: 'Dusk', primary: '#c3b9cf', secondary: '#b8c8d3', accent: '#dcc5b4' },
    { name: 'Warm clay', primary: '#c99476', secondary: '#d8b88f', accent: '#a7b296' },
  ],
  generate(face, openings, levels, orient, params, palette) {
    const c = new Ctx(baguettes, face, openings, levels, orient, params, palette);
    const pitch = c.m('pitch') * c.clim(1.1, 0.9);
    let w = c.m('rod');
    const dp = c.m('depth');
    const wave = c.m('wave');
    const blend = c.pct('blend');
    const off = c.m('offset');
    const rnd = rng(83 + Math.round(face.width * 9));
    const doors = c.doorRects(0.08);
    // keep the screen open enough for every window it passes
    const need = Math.max(0, ...c.openings.filter((o) => !o.door).map((o) => o.reqRatio)) + 0.02;
    if (1 - w / pitch < need) w = pitch * (1 - need);
    const por = 1 - w / pitch;
    const n = Math.max(2, Math.floor(c.width / pitch));
    const u0 = (c.width - (n - 1) * pitch) / 2;
    let rods = 0, len = 0;
    for (let i = 0; i < n; i++) {
      const u = u0 + i * pitch;
      const tu = u / c.width;
      // pale drift along the face with a whisper of noise
      const fill = ramp(palette, 0.5 + (tu - 0.5) * blend + (rnd() - 0.5) * 0.1);
      const d0 = off + (wave / 2) * (1 + Math.sin(tu * Math.PI * 2.2 - 0.8));
      const holes = doors.filter((d) => d.x0 < u + w / 2 && d.x1 > u - w / 2).map((d) => [d.y0, d.y1] as [number, number]);
      for (const [a, b] of subtract1D(c.bottom, c.top, holes)) {
        if (b - a < 0.3) continue;
        const r = { x0: u - w / 2, x1: u + w / 2, y0: a, y1: b };
        if (doors.some((d) => overlap(d, r) > 0)) continue;
        c.add({ kind: 'box', role: 'screen', porosity: por, fill, u: u - w / 2, w, z: a, h: b - a, d0, d1: d0 + dp });
        rods++;
        len += b - a;
      }
    }
    // slim carrier rails at the slab bands
    let rail = 0;
    for (const bd of c.bands) {
      if (bd.kind !== 'floor' && bd.kind !== 'roof') continue;
      const zc = (bd.z0 + bd.z1) / 2;
      for (const r of c.clearDoors({ x0: 0, x1: c.width, y0: zc - 0.03, y1: zc + 0.03 }, 0.08)) {
        if (c.solid(r, 0.02).length !== 1) continue;
        c.add({ kind: 'box', role: 'solid', fill: '#9a978f', u: r.x0, w: r.x1 - r.x0, z: r.y0, h: r.y1 - r.y0, d0: 0, d1: off });
        rail += r.x1 - r.x0;
      }
    }
    c.row('Glazed terracotta baguette', sz(w, dp), palette.name, rods, 0);
    c.row('Baguette (length)', sz(w, dp), palette.name, len, 0, 'm');
    c.row('Carrier rail', sz(0.06, off), 'Aluminium', rail, 0, 'm');
    c.notes.push(`${rods} rods at ${Math.round(pitch * 1000)} mm, screen ${Math.round(por * 100)}% open.`);
    return c.finish();
  },
};
