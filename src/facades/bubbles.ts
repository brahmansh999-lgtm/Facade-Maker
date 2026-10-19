import type { FacadeType } from './types.ts';
import { Ctx, def } from './kit.ts';
import { overlap } from '../geometry/rect.ts';
import { rng } from '../model/units.ts';
import { ramp } from './voronoi.ts';

const SEG = 14;

export const bubbles: FacadeType = {
  id: 'bubbles',
  num: 5,
  name: 'Bubble skin',
  description: 'Packed ETFE cushions in soft colour, large bubbles settling low and small ones rising, like foam. Every cushion is a shallow dome held off the wall; they part around windows and doors so nothing is clouded.',
  params: [
    def({ key: 'rmax', label: 'Largest bubble', unit: 'mm', min: 400, max: 1400, step: 25, default: 850 }),
    def({ key: 'rmin', label: 'Smallest bubble', unit: 'mm', min: 150, max: 600, step: 25, default: 275 }),
    def({ key: 'gap', label: 'Gap', unit: 'mm', min: 20, max: 200, step: 5, default: 60 }),
    def({ key: 'dome', label: 'Dome height', unit: '%', min: 0, max: 80, step: 1, default: 40 }),
    def({ key: 'tint', label: 'Film opacity', unit: '%', min: 40, max: 100, step: 1, default: 85 }),
    def({ key: 'offset', label: 'Stand-off', unit: 'mm', min: 60, max: 500, step: 10, default: 140 }),
  ],
  palettes: [
    { name: 'Soap film', primary: '#bfe9ff', secondary: '#d9c2ff', accent: '#ffc8e2' },
    { name: 'Coral reef', primary: '#ffb347', secondary: '#ff7f6b', accent: '#2ec4b6' },
    { name: 'Opal white', primary: '#f6f6f3', secondary: '#e4edf1', accent: '#d5e1e8' },
  ],
  generate(face, openings, levels, orient, params, palette) {
    const c = new Ctx(bubbles, face, openings, levels, orient, params, palette);
    const rmax = c.m('rmax'), rmin = Math.min(rmax, c.m('rmin'));
    const gap = c.m('gap');
    const dome = c.pct('dome') * c.clim(0.85, 1.2);
    const op = c.pct('tint');
    const off = c.m('offset');
    const rnd = rng(59 + Math.round(face.width * 11));
    const opens = [...c.openRects(0.08), ...c.doorRects(0.1)];
    const H = c.top - c.bottom;
    const placed: { u: number; z: number; r: number }[] = [];
    // big bubbles first, low down; then ever smaller ones fill in and drift upward
    const passes = 7;
    for (let k = 0; k < passes; k++) {
      const r0 = rmax - ((rmax - rmin) * k) / (passes - 1);
      const tries = Math.ceil((c.width * H) / (r0 * r0)) * 4;
      for (let i = 0; i < tries; i++) {
        const r = r0 * (0.9 + rnd() * 0.2);
        const u = r + rnd() * (c.width - 2 * r);
        // bias big bubbles to the lower part of the face
        const bias = Math.pow(rnd(), 1 + (1 - k / (passes - 1)) * 0.8);
        const z = c.bottom + r + bias * (H - 2 * r);
        if (u - r < 0 || u + r > c.width || z - r < c.bottom || z + r > c.top) continue;
        if (placed.some((q) => Math.hypot(q.u - u, q.z - z) < q.r + r + gap)) continue;
        if (opens.some((o) => overlap(o, { x0: u - r, x1: u + r, y0: z - r, y1: z + r }) > 0)) continue;
        placed.push({ u, z, r });
      }
    }
    let film = 0;
    for (const b of placed) {
      const t = ((b.z - c.bottom) / H) * 0.6 + (b.u / c.width) * 0.4 + (rnd() - 0.5) * 0.15;
      const fill = ramp(palette, t);
      const apex: [number, number, number] = [b.u, b.z, off + b.r * dome];
      const ring: [number, number, number][] = [];
      for (let i = 0; i < SEG; i++) {
        const a = (i / SEG) * Math.PI * 2;
        ring.push([b.u + Math.cos(a) * b.r, b.z + Math.sin(a) * b.r, off]);
      }
      for (let i = 0; i < SEG; i++) c.add({ kind: 'facet', role: 'solid', soft: true, fill, opacity: op, pts: [ring[i], ring[(i + 1) % SEG], apex] });
      c.add({ kind: 'line', role: 'screen', porosity: 1, fill: '#55595d', width: 0.015, pts: [...ring, ring[0]] });
      film += Math.PI * b.r * b.r;
    }
    const sizes = placed.map((b) => b.r);
    c.row('ETFE cushion, 3-layer', `Ø ${Math.round(Math.min(...sizes, rmax) * 2000)}–${Math.round(Math.max(...sizes, rmin) * 2000)}`, palette.name, placed.length, 0);
    c.row('ETFE film (projected)', '250 µm', palette.name, 1, film, 'm²');
    c.row('Ring beam + air supply', 'Al extrusion', 'Aluminium', placed.length, 0);
    c.notes.push(`${placed.length} cushions packed between ${Math.round(rmin * 2000)} and ${Math.round(rmax * 2000)} mm.`);
    return c.finish();
  },
};
