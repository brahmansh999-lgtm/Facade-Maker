import type { FacadeType, Prim } from './types.ts';
import { Ctx, def, sz } from './kit.ts';
import { barHitsRect } from '../drawings/primDraw.ts';
import { overlap } from '../geometry/rect.ts';
import { rng } from '../model/units.ts';
import { mix } from '../drawings/color.ts';
import { area, centroid, cutAround, inset, uniqueEdges, voronoiCells, type P2 } from './voronoi.ts';

const inside = (p: P2, poly: P2[]) => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ui, zi] = poly[i], [uj, zj] = poly[j];
    if (zi > p[1] !== zj > p[1] && p[0] < ((uj - ui) * (p[1] - zi)) / (zj - zi) + ui) hit = !hit;
  }
  return hit;
};

export const living: FacadeType = {
  id: 'living',
  num: 4,
  name: 'Voronoi living wall',
  description: 'A slim Voronoi frame held off the wall, its cells planted as pockets of fern, moss and trailing green. Planting thickens towards the ground and thins out as it climbs; cells next to windows and doors stay open so views and daylight are never lost.',
  params: [
    def({ key: 'cell', label: 'Cell size', unit: 'mm', min: 900, max: 3000, step: 50, default: 1600 }),
    def({ key: 'field', label: 'Cell field', unit: '', kind: 'select', default: 'rising', options: [
      { value: 'uniform', label: 'Even' }, { value: 'rising', label: 'Finer with height' }, { value: 'diagonal', label: 'Growing across' }] }),
    def({ key: 'cover', label: 'Planted cells', unit: '%', min: 10, max: 100, step: 1, default: 62 }),
    def({ key: 'density', label: 'Foliage density', unit: '%', min: 20, max: 100, step: 1, default: 70 }),
    def({ key: 'frame', label: 'Frame width', unit: 'mm', min: 30, max: 150, step: 5, default: 60 }),
    def({ key: 'offset', label: 'Stand-off', unit: 'mm', min: 120, max: 500, step: 10, default: 240 }),
  ],
  palettes: [
    { name: 'Fern & white', primary: '#6e9a5b', secondary: '#3f6b43', accent: '#f1f0eb' },
    { name: 'Moss & bronze', primary: '#87a063', secondary: '#55703f', accent: '#7f6449' },
    { name: 'Olive & graphite', primary: '#9aa66f', secondary: '#5f6f4a', accent: '#3a3c3e' },
  ],
  generate(face, openings, levels, orient, params, palette) {
    const c = new Ctx(living, face, openings, levels, orient, params, palette);
    const S = c.m('cell');
    const cover = c.pct('cover') * c.clim(0.9, 1.15);
    const dens = c.pct('density');
    const g = c.m('frame');
    const off = c.m('offset');
    const rnd = rng(67 + Math.round(face.width * 15));
    const opens = [...c.openRects(0.12), ...c.doorRects(0.15)];
    const cells = voronoiCells(c, S, c.str('field'), rnd);
    const H = c.top - c.bottom;

    let planted = 0, green = 0, tufts = 0;
    for (const poly of cells) {
      const ip = inset(poly, g / 2 + 0.03);
      if (!ip) continue;
      const [, cz] = centroid(ip);
      // more planting low down, sparser towards the roof
      const p = cover * (1.25 - 0.5 * ((cz - c.bottom) / H));
      if (rnd() > p) continue;
      // cells beside a window are planted only in the pieces clear of it
      for (const pc of cutAround(ip, opens)) {
        const A = area(pc);
        if (A < 0.12) continue;
        const us = pc.map((q) => q[0]), zs = pc.map((q) => q[1]);
        const bb = { x0: Math.min(...us), x1: Math.max(...us), y0: Math.min(...zs), y1: Math.max(...zs) };
        // moss backing pad, then tufts of foliage scattered over the pocket
        c.add({ kind: 'facet', role: 'solid', soft: true, fill: mix(palette.secondary, '#2f3a2c', 0.35), pts: pc.map(([u, z]) => [u, z, off - 0.03] as [number, number, number]) });
        const n = Math.max(3, Math.round((A / 0.09) * dens));
        for (let k = 0, tries = 0; k < n && tries < n * 6; tries++) {
          const pt: P2 = [bb.x0 + rnd() * (bb.x1 - bb.x0), bb.y0 + rnd() * (bb.y1 - bb.y0)];
          if (!inside(pt, pc)) continue;
          const r = 0.08 + rnd() * 0.12;
          const disc = { x0: pt[0] - r, x1: pt[0] + r, y0: pt[1] - r, y1: pt[1] + r };
          if (opens.some((o) => overlap(o, disc) > 0)) continue;
          // lighter leaves sit forward, deeper greens behind
          const t = rnd();
          c.add({ kind: 'disc', role: 'solid', fill: mix(palette.secondary, palette.primary, t), u: pt[0], z: pt[1], r, d: off + 0.02 + t * 0.16 });
          k++;
          tufts++;
        }
        planted++;
        green += A;
      }
    }
    let len = 0;
    for (const [a, b] of uniqueEdges(cells)) {
      const bar: Prim = { kind: 'bar', role: 'solid', fill: palette.accent, a, b, w: g, d0: off - 0.06, d1: off + 0.04 };
      if (opens.some((r) => barHitsRect(bar as Extract<Prim, { kind: 'bar' }>, r))) continue;
      c.add(bar);
      len += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    c.row('Planted pocket, felt + tray', 'drip-irrigated', palette.name, planted, green, 'nr');
    c.row('Planting area', 'Ferns, mosses, trailing ivy', palette.name, 1, green, 'm²');
    c.row('Cell frame', sz(g, 0.1), 'Powder-coated Al', len, 0, 'm');
    c.row('Drip line', 'ø16 PE', 'Irrigation', Math.ceil(len / 3), 0);
    c.notes.push(`${planted} of ${cells.length} cells planted, ${Math.round(green)} m² of green, ${tufts} tufts.`);
    return c.finish();
  },
};
