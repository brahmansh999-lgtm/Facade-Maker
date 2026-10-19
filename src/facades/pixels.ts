import type { FacadeType } from './types.ts';
import { BAND, Ctx, def, freeIntervals, screenZones, sz } from './kit.ts';
import { overlap } from '../geometry/rect.ts';
import { rng } from '../model/units.ts';

/** a flat plate centred at (uc,zc,dc), rotated θ about its vertical or horizontal axis */
export function plate(uc: number, zc: number, dc: number, hu: number, hz: number, theta: number, axis: 'v' | 'h'): [number, number, number][] {
  const c = Math.cos(theta), s = Math.sin(theta);
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([a, b]) =>
    axis === 'v' ? [uc + a * hu * c, zc + b * hz, dc + a * hu * s] : [uc + a * hu, zc + b * hz * c, dc + b * hz * s]);
}

export const pixels: FacadeType = {
  id: 'pixels',
  num: 1,
  name: 'Kinetic pixel skin',
  description: 'A field of anodised aluminium plates on a rail grid, each pivoting on its own axis. The angle field ripples across the face; plates in front of windows turn edge-on until the skin passes the room’s required free area. Doors stay clear.',
  params: [
    def({ key: 'size', label: 'Pixel size', unit: 'mm', min: 200, max: 800, step: 10, default: 420 }),
    def({ key: 'gap', label: 'Gap', unit: 'mm', min: 10, max: 120, step: 5, default: 40 }),
    def({ key: 'angle', label: 'Max. rotation', unit: '°', min: 0, max: 80, step: 1, default: 55 }),
    def({ key: 'field', label: 'Angle field', unit: '', kind: 'select', default: 'wave', options: [
      { value: 'wave', label: 'Ripple' }, { value: 'radial', label: 'Open at windows' }, { value: 'gradient', label: 'Opening upward' }, { value: 'noise', label: 'Scatter' }] }),
    def({ key: 'axis', label: 'Pivot axis', unit: '', kind: 'select', default: 'v', options: [
      { value: 'v', label: 'Vertical' }, { value: 'h', label: 'Horizontal' }] }),
    def({ key: 'offset', label: 'Offset from wall', unit: 'mm', min: 150, max: 700, step: 10, default: 320 }),
  ],
  palettes: [
    { name: 'Anodised silver', primary: '#c3c6c8', secondary: '#9fa4a8', accent: '#6d7276' },
    { name: 'Champagne', primary: '#d5c4a1', secondary: '#bba985', accent: '#7c7262' },
    { name: 'Mirror graphite', primary: '#5d6266', secondary: '#43474a', accent: '#8c9195' },
  ],
  generate(face, openings, levels, orient, params, palette) {
    const c = new Ctx(pixels, face, openings, levels, orient, params, palette);
    const size = c.m('size'), gap = c.m('gap');
    const maxA = (c.num('angle') * Math.PI) / 180 * c.clim(1.15, 0.65);
    const field = c.str('field');
    const axis = c.str('axis') as 'v' | 'h';
    const off = c.m('offset');
    const pitch = size + gap;
    const rnd = rng(31 + Math.round(face.width * 7));
    const doors = c.doorRects(0.12);
    const opens = c.openRects(0.4);
    const f = (u: number, z: number) => {
      if (field === 'wave') return 0.5 + 0.5 * Math.sin((u / 3.2) * Math.PI * 2 + (z / 4.5) * Math.PI * 2);
      if (field === 'gradient') return (z - c.bottom) / (c.top - c.bottom);
      if (field === 'noise') return rnd();
      let v = 0.1;
      for (const r of opens) {
        const du = Math.max(r.x0 - u, 0, u - r.x1), dz = Math.max(r.y0 - z, 0, z - r.y1);
        v = Math.max(v, 1 - Math.hypot(du, dz) / 1.4);
      }
      return v;
    };
    let plates = 0, area = 0, turned = 0;
    for (const zn of screenZones(c)) {
      const rows = Math.max(1, Math.round((zn.z1 - zn.z0) / pitch));
      const ch = (zn.z1 - zn.z0) / rows;
      for (const [b0, b1] of c.bays) {
        const cols = Math.max(1, Math.round((b1 - b0) / pitch));
        const cw = (b1 - b0) / cols;
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
          const cell = { x0: b0 + i * cw, x1: b0 + (i + 1) * cw, y0: zn.z0 + j * ch, y1: zn.z0 + (j + 1) * ch };
          if (doors.some((d) => overlap(d, cell) > 0)) continue;
          const uc = (cell.x0 + cell.x1) / 2, zc = (cell.y0 + cell.y1) / 2;
          const hu = (cw - gap) / 2, hz = (ch - gap) / 2;
          let th = maxA * f(uc, zc) * (axis === 'v' && (i + j) % 2 ? -1 : 1);
          const cover = (4 * hu * hz) / (cw * ch);
          const need = c.req(cell);
          if (need > 0) {
            const minCos = (1 - need - 0.02) / cover;
            if (Math.abs(Math.cos(th)) > minCos) { th = Math.sign(th || 1) * Math.acos(Math.max(0, Math.min(1, minCos))); turned++; }
          }
          const por = 1 - cover * Math.abs(Math.cos(th));
          const dc = off + Math.max(hu, hz) * Math.abs(Math.sin(th)) + 0.02;
          c.add({ kind: 'facet', role: 'screen', porosity: por, fill: (i * 7 + j * 3) % 5 === 0 ? palette.secondary : palette.primary, pts: plate(uc, zc, dc, hu, hz, th, axis) });
          plates++;
          area += 4 * hu * hz;
        }
        // carrier rails at every row joint
        for (let j = 0; j <= rows; j++) {
          const z = zn.z0 + j * ch - 0.015;
          for (const [a, b] of freeIntervals(b0, b1, z, z + 0.03, doors)) {
            c.add({ kind: 'box', role: 'screen', porosity: 0.92, fill: palette.accent, u: a, w: b - a, z, h: 0.03, d0: off - 0.04, d1: off });
          }
        }
      }
    }
    // brackets off the slab bands
    for (const b of c.bands) {
      if (b.kind !== 'floor' && b.kind !== 'roof') continue;
      for (const u of c.lines) {
        const uc = Math.max(0.05, Math.min(c.width - 0.05, u));
        c.add({ kind: 'box', role: 'solid', fill: palette.accent, u: uc - 0.04, w: 0.08, z: b.z0 + 0.05, h: BAND - 0.1, d0: 0, d1: off });
      }
    }
    c.row('Pivoting aluminium pixel', `${sz(size, size)} × 3 thk`, palette.name, plates, area, 'm²');
    c.row('Pivot pin + bearing set', 'SS 316', 'Stainless steel', plates, 0);
    c.row('Carrier rail', '30 × 40', 'Extruded aluminium', 1, 0, 'm');
    c.notes.push(`${plates} plates; ${turned} turned edge-on in front of glazing to keep the free area.`);
    return c.finish();
  },
};
