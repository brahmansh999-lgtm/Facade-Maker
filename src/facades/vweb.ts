import type { FacadeType, Prim } from './types.ts';
import { Ctx, def, sz } from './kit.ts';
import { barHitsRect } from '../drawings/primDraw.ts';
import { rng } from '../model/units.ts';
import { uniqueEdges, voronoiCells } from './voronoi.ts';

export const vweb: FacadeType = {
  id: 'vweb',
  num: 2,
  name: 'Voronoi web screen',
  description: 'A free-standing lattice of Voronoi members, like bone or a leaf skeleton, held off the wall. Members thicken towards the ground where the loads gather and thin out as they rise; the web passes in front of windows only as an open screen and always stops at doors.',
  params: [
    def({ key: 'cell', label: 'Cell size', unit: 'mm', min: 700, max: 3000, step: 50, default: 1500 }),
    def({ key: 'field', label: 'Cell field', unit: '', kind: 'select', default: 'rising', options: [
      { value: 'uniform', label: 'Even' }, { value: 'rising', label: 'Finer with height' }, { value: 'diagonal', label: 'Growing across' }] }),
    def({ key: 'web', label: 'Member width', unit: 'mm', min: 40, max: 250, step: 5, default: 85 }),
    def({ key: 'taper', label: 'Thickening at base', unit: '%', min: 0, max: 150, step: 5, default: 70 }),
    def({ key: 'depth', label: 'Member depth', unit: 'mm', min: 60, max: 400, step: 10, default: 160 }),
    def({ key: 'offset', label: 'Stand-off', unit: 'mm', min: 150, max: 800, step: 10, default: 380 }),
  ],
  palettes: [
    { name: 'Bronze', primary: '#8a6a4b', secondary: '#73573c', accent: '#3b2f25' },
    { name: 'White UHPC', primary: '#efeee9', secondary: '#dcdad3', accent: '#9a9891' },
    { name: 'Volcanic black', primary: '#2d2e30', secondary: '#3a3b3e', accent: '#8b8d90' },
  ],
  generate(face, openings, levels, orient, params, palette) {
    const c = new Ctx(vweb, face, openings, levels, orient, params, palette);
    const S = c.m('cell') * c.clim(1.1, 0.9);
    const web = c.m('web');
    const taper = c.pct('taper');
    const depth = c.m('depth');
    const off = c.m('offset');
    const rnd = rng(41 + Math.round(face.width * 13));
    const doors = c.doorRects(0.1);
    const H = c.top - c.bottom;
    const edges = uniqueEdges(voronoiCells(c, S, c.str('field'), rnd));
    const widthAt = (z: number) => web * (1 + taper * (1 - (z - c.bottom) / H));
    // porosity of the web as a whole; thin it if any window behind needs more open area
    const solidArea = edges.reduce((s, [a, b]) => s + Math.hypot(b[0] - a[0], b[1] - a[1]) * widthAt((a[1] + b[1]) / 2), 0);
    let por = 1 - solidArea / (c.width * H);
    const need = Math.max(0, ...c.openings.filter((o) => !o.door).map((o) => o.reqRatio)) + 0.02;
    const k = por < need ? (1 - need) / (1 - por) : 1;
    por = Math.max(por, need);
    let n = 0, len = 0;
    for (const [a, b] of edges) {
      const w = widthAt((a[1] + b[1]) / 2) * k;
      const bar: Prim = { kind: 'bar', role: 'screen', porosity: por, fill: palette.primary, a, b, w, d0: off, d1: off + depth };
      if (doors.some((r) => barHitsRect(bar as Extract<Prim, { kind: 'bar' }>, r))) continue;
      c.add(bar);
      n++;
      len += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    // stand-off brackets where the web crosses each slab band
    let brackets = 0;
    for (const bd of c.bands) {
      if (bd.kind !== 'floor' && bd.kind !== 'roof') continue;
      for (let u = 0.6; u < c.width - 0.3; u += 2.4) {
        const r = { x0: u - 0.05, x1: u + 0.05, y0: bd.z0 + 0.05, y1: bd.z1 - 0.05 };
        if (c.solid(r, 0.02).length !== 1) continue;
        c.add({ kind: 'box', role: 'solid', fill: palette.accent, u: r.x0, w: 0.1, z: r.y0, h: r.y1 - r.y0, d0: 0, d1: off });
        brackets++;
      }
    }
    c.row('Web member, cast', `${sz(web, depth)} → ${Math.round(web * (1 + taper) * 1000)} at base`, palette.name, n, 0);
    c.row('Web member (length)', sz(web, depth), palette.name, len, 0, 'm');
    c.row('Stand-off bracket', sz(0.1, off), 'Stainless steel', brackets, 0);
    c.notes.push(`${n} members, web ${Math.round(por * 100)}% open.`);
    return c.finish();
  },
};
