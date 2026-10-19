import type { FacadeType, Prim } from './types.ts';
import { Ctx, def, sz } from './kit.ts';
import { barHitsRect } from '../drawings/primDraw.ts';
import { rng } from '../model/units.ts';
import { area, centroid, cutAround, inset, ramp, uniqueEdges, voronoiCells } from './voronoi.ts';

export const chroma: FacadeType = {
  id: 'chroma',
  num: 2,
  name: 'Chromatic Voronoi glass',
  description: 'Translucent coloured glass cells on a slim white frame, the colour drifting across the house like light through a prism. The glass is cut crisply round every window and door, so views and daylight stay untinted while the walls glow.',
  params: [
    def({ key: 'cell', label: 'Cell size', unit: 'mm', min: 1000, max: 3500, step: 100, default: 1900 }),
    def({ key: 'field', label: 'Cell field', unit: '', kind: 'select', default: 'diagonal', options: [
      { value: 'uniform', label: 'Even' }, { value: 'diagonal', label: 'Growing across' }, { value: 'rising', label: 'Finer with height' }, { value: 'openings', label: 'Finer round windows' }] }),
    def({ key: 'colour', label: 'Colour flow', unit: '', kind: 'select', default: 'gradient', options: [
      { value: 'gradient', label: 'Diagonal gradient' }, { value: 'height', label: 'By height' }, { value: 'scatter', label: 'Scattered' }] }),
    def({ key: 'tint', label: 'Glass opacity', unit: '%', min: 30, max: 95, step: 1, default: 72 }),
    def({ key: 'joint', label: 'Frame', unit: 'mm', min: 30, max: 150, step: 5, default: 60 }),
    def({ key: 'offset', label: 'Stand-off', unit: 'mm', min: 80, max: 500, step: 10, default: 200 }),
  ],
  palettes: [
    { name: 'Aurora', primary: '#2ec4b6', secondary: '#7b5cff', accent: '#ff5fa2' },
    { name: 'Citrus', primary: '#ffd23f', secondary: '#ff8c42', accent: '#e8336d' },
    { name: 'Lagoon', primary: '#a8e6cf', secondary: '#3fc1c9', accent: '#364f6b' },
  ],
  generate(face, openings, levels, orient, params, palette) {
    const c = new Ctx(chroma, face, openings, levels, orient, params, palette);
    const S = c.m('cell');
    const mode = c.str('colour');
    const op = c.pct('tint');
    const g = c.m('joint');
    const off = c.m('offset');
    const rnd = rng(23 + Math.round(face.width * 17));
    const opens = [...c.openRects(0.06), ...c.doorRects(0.08)];
    const cells = voronoiCells(c, S, c.str('field'), rnd);
    const H = c.top - c.bottom;

    let panes = 0, glass = 0;
    for (const poly of cells) {
      const ip = inset(poly, g / 2 + 0.01);
      if (!ip) continue;
      const [cu, cz] = centroid(ip);
      const t = mode === 'height' ? (cz - c.bottom) / H : mode === 'scatter' ? rnd() : (cu / c.width) * 0.55 + ((cz - c.bottom) / H) * 0.45;
      const fill = ramp(palette, t + (rnd() - 0.5) * 0.12);
      // glass right up to each opening: the cell is cut into clear-cornered pieces round it
      for (const pc of cutAround(ip, opens)) {
        c.add({ kind: 'facet', role: 'solid', fill, opacity: op, pts: pc.map(([u, z]) => [u, z, off] as [number, number, number]) });
        panes++;
        glass += area(pc);
      }
    }
    let len = 0;
    for (const [a, b] of uniqueEdges(cells)) {
      const bar: Prim = { kind: 'bar', role: 'solid', fill: '#f4f3ef', a, b, w: g, d0: off - 0.04, d1: off + 0.03 };
      if (opens.some((r) => barHitsRect(bar as Extract<Prim, { kind: 'bar' }>, r))) continue;
      c.add(bar);
      len += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    c.row('Coloured glass cell', '8.8 laminated, colour interlayer', palette.name, panes, glass, 'nr');
    c.row('Glass area', '8.8 laminated', palette.name, 1, glass, 'm²');
    c.row('Cell frame', sz(g, 0.07), 'White powder-coated Al', len, 0, 'm');
    c.notes.push(`${cells.length} cells, ${panes} glazed, opacity ${Math.round(op * 100)}%.`);
    return c.finish();
  },
};
