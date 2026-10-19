import type { FacadeType } from './types.ts';
import { Ctx, def, sz } from './kit.ts';
import { subtract1D } from '../geometry/rect.ts';

export const eggcrate: FacadeType = {
  id: 'eggcrate',
  num: 14,
  name: 'UHPC brise-soleil grid',
  description: 'Thin-section ultra-high-performance concrete grid standing off the envelope: verticals subdivide each structural bay, horizontals sit on every slab band. Deep, crisp cells shade high and low sun; open area is checked against the windows behind.',
  params: [
    def({ key: 'cols', label: 'Cells per bay', unit: 'nr', min: 1, max: 4, step: 1, default: 2 }),
    def({ key: 'rows', label: 'Cells per storey', unit: 'nr', min: 1, max: 3, step: 1, default: 1 }),
    def({ key: 'depth', label: 'Cell depth', unit: 'mm', min: 300, max: 900, step: 25, default: 600 }),
    def({ key: 'thick', label: 'Fin thickness', unit: 'mm', min: 80, max: 200, step: 10, default: 120 }),
    def({ key: 'offset', label: 'Offset from wall', unit: 'mm', min: 50, max: 300, step: 10, default: 75 }),
    def({ key: 'slant', label: 'Vertical splay', unit: '°', min: 0, max: 30, step: 1, default: 0 }),
  ],
  palettes: [
    { name: 'White UHPC', primary: '#ebeae6', secondary: '#dad8d3', accent: '#a3a5a7' },
    { name: 'Graphite UHPC', primary: '#5d6164', secondary: '#4c4f52', accent: '#8a8e91' },
    { name: 'Sand UHPC', primary: '#d8ccb6', secondary: '#c5b9a2', accent: '#8f877a' },
  ],
  generate(face, openings, levels, orient, params, palette) {
    const c = new Ctx(eggcrate, face, openings, levels, orient, params, palette);
    const depth = Math.min(1.0, c.m('depth') * c.clim(0.8, 1.3));
    const t = c.m('thick');
    const off = c.m('offset');
    const cols = Math.round(c.num('cols'));
    const rows = Math.round(c.num('rows'));
    const slant = c.num('slant');
    const doors = c.doorRects(0.1);
    // vertical positions: grid lines + subdivisions
    const vs: number[] = [];
    c.bays.forEach(([a, b], i) => {
      for (let k = i === 0 ? 0 : 1; k <= cols; k++) vs.push(a + ((b - a) * k) / cols);
    });
    const cellW = c.width / Math.max(1, vs.length - 1);
    const storeyH = c.storeys[0] ? c.storeys[0].z1 - c.storeys[0].z0 : 3;
    const cellH = storeyH / rows;
    const porosity = Math.max(0, ((cellW - t) * (cellH - t)) / (cellW * cellH));
    let vLen = 0, hLen = 0;
    vs.forEach((u, i) => {
      const uc = Math.min(c.width - t / 2, Math.max(t / 2, u));
      const holes = doors.filter((d) => d.x1 > uc - t && d.x0 < uc + t).map((d) => [d.y0, d.y1] as [number, number]);
      const rot = slant ? ((i / Math.max(1, vs.length - 1)) * 2 - 1) * slant : 0;
      for (const [z0, z1] of subtract1D(c.bottom, c.top, holes)) {
        c.add({ kind: 'box', role: 'screen', porosity, fill: palette.primary, u: uc - t / 2, w: t, z: z0, h: z1 - z0, d0: off, d1: off + depth, rot });
        vLen += z1 - z0;
      }
    });
    // horizontals: slab bands (solid, aligned with slabs) and storey subdivisions (screen)
    const hz: { z: number; solid: boolean }[] = [];
    for (const b of c.bands) if (b.kind === 'floor' || b.kind === 'roof') hz.push({ z: b.z1 - t, solid: true });
    hz.push({ z: c.top - t, solid: true });
    hz.push({ z: c.bottom, solid: true });
    for (const s of c.storeys) for (let r = 1; r < rows; r++) hz.push({ z: s.z0 + ((s.z1 - s.z0) * r) / rows - t / 2, solid: false });
    for (const h of hz) {
      const rect = { x0: 0, x1: c.width, y0: h.z, y1: h.z + t };
      const pieces = h.solid ? c.solid(rect, 0.02) : c.clearDoors(rect);
      for (const r of pieces) {
        c.add({
          kind: 'box', role: h.solid ? 'solid' : 'screen', porosity, fill: palette.secondary,
          u: r.x0, z: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0, d0: off, d1: off + depth,
        });
        hLen += r.x1 - r.x0;
      }
    }
    c.row('Vertical fin', sz(t, depth), 'UHPC, ' + palette.name, vs.length, 0);
    c.row('Vertical fin (length)', sz(t, depth), 'UHPC, ' + palette.name, vLen, 0, 'm');
    c.row('Horizontal fin (length)', sz(t, depth), 'UHPC, ' + palette.name, hLen, 0, 'm');
    c.row('Concrete in fins', '', 'UHPC C150', 1, (vLen + hLen) * t * depth, 'm²');
    c.notes.push(`Cell ${Math.round(cellW * 1000)} × ${Math.round(cellH * 1000)} mm, ${Math.round(porosity * 100)}% open.`);
    return c.finish();
  },
};
