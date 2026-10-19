import type { FacadeType, Prim } from './types.ts';
import { BAND, Ctx, def, sz } from './kit.ts';
import { barHitsRect } from '../drawings/primDraw.ts';
import { overlap } from '../geometry/rect.ts';
import { mix } from '../drawings/color.ts';

export const diagrid: FacadeType = {
  id: 'diagrid',
  num: 11,
  name: 'Diagrid exoskeleton',
  description: 'A steel diagrid standing proud of the envelope, its nodes landing on every slab band. Members are clash-checked against openings and simply stop at doors; tinted glass infills only fill triangles clear of the windows.',
  params: [
    def({ key: 'module', label: 'Diamond width', unit: 'mm', min: 1800, max: 6000, step: 100, default: 3000 }),
    def({ key: 'tiers', label: 'Tiers per storey', unit: 'nr', min: 1, max: 2, step: 1, default: 1 }),
    def({ key: 'member', label: 'Member size', unit: 'mm', min: 100, max: 350, step: 10, default: 180 }),
    def({ key: 'offset', label: 'Stand-off', unit: 'mm', min: 300, max: 1000, step: 25, default: 500 }),
    def({ key: 'infill', label: 'Infill', unit: '', kind: 'select', default: 'tinted', options: [
      { value: 'none', label: 'Open frame' }, { value: 'tinted', label: 'Tinted glass triangles' }] }),
    def({ key: 'nodes', label: 'Cast nodes', unit: '', kind: 'toggle', default: true }),
  ],
  palettes: [
    { name: 'White steel', primary: '#e4e4e1', secondary: '#9fb4bf', accent: '#a6a8aa' },
    { name: 'Graphite steel', primary: '#4c5154', secondary: '#7f97a1', accent: '#6b7073' },
    { name: 'Bronze steel', primary: '#8a6c4f', secondary: '#b89a76', accent: '#6a5a4a' },
  ],
  generate(face, openings, levels, orient, params, palette) {
    const c = new Ctx(diagrid, face, openings, levels, orient, params, palette);
    const m = c.m('module');
    const tiers = Math.round(c.num('tiers'));
    const w = c.m('member') * c.clim(0.9, 1.15);
    const off = c.m('offset');
    const doors = c.doorRects(0.1);
    const opens = c.openRects(0.05);
    // node rows: plinth, centre of every slab band, roof band, parapet top; subdivided into tiers
    const base: number[] = [c.bottom, ...face.levels.slice(1).map((l) => l.ffl - BAND / 2), face.roofZ - BAND / 2, c.top - w / 2];
    const zs: number[] = [];
    for (let i = 0; i < base.length - 1; i++) {
      const t = i < base.length - 2 ? tiers : 1;
      for (let k = 0; k < t; k++) zs.push(base[i] + ((base[i + 1] - base[i]) * k) / t);
    }
    zs.push(base[base.length - 1]);
    const d1 = off + w;
    let members = 0, len = 0, glass = 0;
    const cellPor = (zh: number) => Math.max(0, 1 - (2 * w * Math.hypot(m / 2, zh)) / (m * zh));
    const addBar = (a: [number, number], b: [number, number], por: number) => {
      // clip to the face width
      const clip = (p: [number, number], q: [number, number]): [number, number] | null => {
        if (p[0] >= 0 && p[0] <= c.width) return p;
        const ux = p[0] < 0 ? 0 : c.width;
        if ((q[0] - ux) * (p[0] - ux) > 0) return null;
        const t = (ux - p[0]) / (q[0] - p[0]);
        return [ux, p[1] + t * (q[1] - p[1])];
      };
      const A = clip(a, b), B = clip(b, a);
      if (!A || !B || Math.hypot(B[0] - A[0], B[1] - A[1]) < 0.1) return;
      const bar: Prim = { kind: 'bar', role: 'screen', porosity: por, fill: palette.primary, a: A, b: B, w, d0: off, d1 };
      if (doors.some((r) => barHitsRect(bar as Extract<Prim, { kind: 'bar' }>, r))) return;
      c.add(bar);
      members++;
      len += Math.hypot(B[0] - A[0], B[1] - A[1]);
    };
    for (let r = 0; r < zs.length - 1; r++) {
      const zb = zs[r], zt = zs[r + 1];
      const por = cellPor(zt - zb);
      const sb = (r % 2) * (m / 2), st = ((r + 1) % 2) * (m / 2);
      for (let k = -1; k * m < c.width + m; k++) {
        const ub = k * m + sb;
        addBar([ub, zb], [ub + m / 2, zt], por);
        addBar([ub, zb], [ub - m / 2, zt], por);
        if (c.str('infill') === 'tinted' && (k + r) % 2 === 0) {
          const ut = k * m + st;
          const tri: [number, number][] = [[ut - m / 2 + w, zb + w * 0.7], [ut + m / 2 - w, zb + w * 0.7], [ut, zt - w * 0.9]];
          const box = { x0: Math.min(...tri.map((q) => q[0])), x1: Math.max(...tri.map((q) => q[0])), y0: zb, y1: zt };
          if (box.x0 < 0 || box.x1 > c.width) continue;
          if (opens.some((o) => overlap(o, box) > 0) || doors.some((o) => overlap(o, box) > 0)) continue;
          c.add({ kind: 'facet', role: 'solid', fill: mix(palette.secondary, '#2f3a40', 0.35), opacity: 0.55, pts: tri.map(([u, z]) => [u, z, off + w / 2] as [number, number, number]) });
          glass += ((box.x1 - box.x0) * (zt - zb)) / 2;
        }
      }
      // ring beam at each node row
      addBar([0, zb], [c.width, zb], por);
    }
    addBar([0, zs[zs.length - 1]], [c.width, zs[zs.length - 1]], 0.9);
    // edge columns and slab brackets
    addBar([w / 2, c.bottom], [w / 2, c.top - w / 2], 0.9);
    addBar([c.width - w / 2, c.bottom], [c.width - w / 2, c.top - w / 2], 0.9);
    let nodes = 0;
    for (const z of zs) {
      for (let k = -1; k * m <= c.width + m; k++) {
        const u = k * m + (zs.indexOf(z) % 2) * (m / 2);
        if (u < 0 || u > c.width) continue;
        const nb = { x0: u - w, x1: u + w, y0: z - w, y1: z + w };
        if (doors.some((d) => overlap(d, nb) > 0) || opens.some((o) => overlap(o, nb) > 0)) continue;
        if (c.bool('nodes')) c.add({ kind: 'box', role: 'solid', fill: palette.accent, u: u - w, w: 2 * w, z: z - w, h: 2 * w, d0: off - 0.03, d1: d1 + 0.04 });
        if (base.some((b) => Math.abs(b - z) < 1e-6) && z > c.bottom + 0.1 && z < c.top - 0.3) c.add({ kind: 'box', role: 'solid', fill: palette.accent, u: u - w / 3, w: (2 * w) / 3, z: z - w / 3, h: (2 * w) / 3, d0: 0, d1: off });
        nodes++;
      }
    }
    c.row('Diagrid member (CHS / SHS)', sz(w, w), 'Steel, ' + palette.name, members, 0);
    c.row('Diagrid member (length)', sz(w, w), 'Steel, ' + palette.name, len, 0, 'm');
    c.row('Cast node + slab bracket', sz(2 * w, 2 * w), 'Cast steel', nodes, 0);
    if (glass) c.row('Tinted glass infill', '10.10 laminated', 'Tinted glass', 1, glass, 'm²');
    c.notes.push(`${members} members on a ${Math.round(m * 1000)} mm diamond, ${tiers} tier(s) per storey.`);
    return c.finish();
  },
};
