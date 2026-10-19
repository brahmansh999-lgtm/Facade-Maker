import type { FacadeType } from './types.ts';
import { BAND, Ctx, def, sz } from './kit.ts';
import { subtract1D } from '../geometry/rect.ts';
import { lerp } from '../model/units.ts';

export const fins: FacadeType = {
  id: 'fins',
  num: 2,
  name: 'Vertical timber fins',
  description: 'Hardwood fins on steel rails fixed at each slab band. Fins land on every grid line and are evenly spaced within bays; their angle sweeps across the face. In front of glazing a fin straightens or drops out to keep the required free area.',
  params: [
    def({ key: 'spacing', label: 'Spacing', unit: 'mm', min: 150, max: 900, step: 25, default: 400 }),
    def({ key: 'depth', label: 'Fin depth', unit: 'mm', min: 150, max: 600, step: 25, default: 300 }),
    def({ key: 'thick', label: 'Fin thickness', unit: 'mm', min: 30, max: 100, step: 5, default: 50 }),
    def({ key: 'rot0', label: 'Angle at left', unit: '°', min: -60, max: 60, step: 1, default: 0 }),
    def({ key: 'rot1', label: 'Angle at right', unit: '°', min: -60, max: 60, step: 1, default: 40 }),
    def({ key: 'offset', label: 'Offset from wall', unit: 'mm', min: 0, max: 300, step: 10, default: 80 }),
    def({ key: 'run', label: 'Run', unit: '', kind: 'select', default: 'storey', options: [
      { value: 'storey', label: 'Storey height' }, { value: 'full', label: 'Full height' }] }),
  ],
  palettes: [
    { name: 'Teak', primary: '#a77a4f', secondary: '#8a6240', accent: '#5f5c57' },
    { name: 'Western red cedar', primary: '#c08a62', secondary: '#a5714d', accent: '#6b6862' },
    { name: 'Charred larch', primary: '#3f3a35', secondary: '#2e2a26', accent: '#7c776f' },
  ],
  generate(face, openings, levels, orient, params, palette) {
    const c = new Ctx(fins, face, openings, levels, orient, params, palette);
    const depth = Math.min(0.75, c.m('depth') * c.clim(0.8, 1.3));
    const spacing = Math.max(0.12, c.m('spacing') * c.clim(1.25, 0.8));
    const t = c.m('thick');
    const off = c.m('offset');
    let r0 = c.num('rot0'), r1 = c.num('rot1');
    if (orient.climate) {
      // lean the fins toward the low sun on exposed faces
      const sign = Math.sign(r1 - r0 || 1);
      r1 = lerp(r1, sign * orient.hsa, 0.5 * orient.exposure);
    }
    const doors = c.doorRects(0.1);
    // fin positions: every grid line, evenly subdivided within each bay
    const us: number[] = [];
    c.bays.forEach(([a, b], i) => {
      const n = Math.max(1, Math.round((b - a) / spacing));
      for (let k = i === 0 ? 0 : 1; k <= n; k++) us.push(a + ((b - a) * k) / n);
    });
    const runs = c.str('run') === 'full'
      ? [{ z0: c.bottom, z1: c.top }]
      : [...c.storeys.map((s) => ({ z0: s.z0, z1: s.z1 })), { z0: face.roofZ, z1: c.top }];
    let count = 0, len = 0, dropped = 0;
    for (const u of us) {
      const uc = Math.min(c.width - t / 2, Math.max(t / 2, u));
      const local = us.length > 1 ? spacing : c.width;
      for (const r of runs) {
        const holes = doors.filter((d) => d.x1 > uc - depth && d.x0 < uc + depth).map((d) => [d.y0, d.y1] as [number, number]);
        for (const [z0, z1] of subtract1D(r.z0, r.z1, holes)) {
          if (z1 - z0 < 0.3) continue;
          let rot = lerp(r0, r1, uc / c.width);
          const proj = (a: number) => t * Math.abs(Math.cos((a * Math.PI) / 180)) + depth * Math.abs(Math.sin((a * Math.PI) / 180));
          const box = { x0: uc - proj(rot) / 2, x1: uc + proj(rot) / 2, y0: z0, y1: z1 };
          const need = c.req(box);
          let por = Math.max(0, 1 - proj(rot) / local);
          if (need > 0) {
            for (const tryRot of [rot, rot * 0.5, 0]) {
              rot = tryRot;
              por = Math.max(0, 1 - proj(rot) / local);
              if (por >= need) break;
            }
            if (por < need) { dropped++; continue; }
          }
          c.add({ kind: 'box', role: 'screen', porosity: por, fill: palette.primary, u: uc - t / 2, w: t, z: z0, h: z1 - z0, d0: off, d1: off + depth, rot });
          count++;
          len += z1 - z0;
        }
      }
    }
    // steel rails at slab bands and parapet coping
    for (const b of c.bands) {
      if (b.kind === 'plinth') continue;
      const z = b.kind === 'parapet' ? b.z1 - 0.08 : b.z0 + BAND / 2 - 0.04;
      for (const r of c.solid({ x0: 0, x1: c.width, y0: z, y1: z + 0.08 }, 0.02)) {
        c.add({ kind: 'box', role: 'solid', fill: palette.accent, u: r.x0, z: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0, d0: 0, d1: off + 0.04 });
      }
      c.row('MS channel rail', '75 × 40', 'Galvanised steel, ' + (palette.name === 'Charred larch' ? 'black' : 'grey'), c.width, 0, 'm');
    }
    c.row('Timber fin', sz(t, depth), palette.name, count, 0);
    c.row('Timber fin (length)', sz(t, depth), palette.name, len, 0, 'm');
    if (dropped) c.notes.push(`${dropped} fin run(s) omitted in front of glazing to keep the required free area.`);
    return c.finish();
  },
};
