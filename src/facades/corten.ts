import type { FacadeType } from './types.ts';
import { BAND, Ctx, def, sz } from './kit.ts';
import { overlap } from '../geometry/rect.ts';

const TILE = 0.6;

export const corten: FacadeType = {
  id: 'corten',
  num: 7,
  name: 'Perforated weathering steel',
  description: '3 mm weathering-steel panels on a rail sub-frame off the slab bands. Hole diameter follows a density map; tiles in front of windows are opened until they pass the room’s required free area, with doors left clear.',
  params: [
    def({ key: 'pitch', label: 'Hole pitch', unit: 'mm', min: 40, max: 150, step: 5, default: 80 }),
    def({ key: 'dmin', label: 'Min. hole', unit: 'mm', min: 5, max: 40, step: 1, default: 12 }),
    def({ key: 'dmax', label: 'Max. hole', unit: 'mm', min: 20, max: 80, step: 1, default: 48 }),
    def({ key: 'map', label: 'Density map', unit: '', kind: 'select', default: 'openings', options: [
      { value: 'openings', label: 'Open at windows' }, { value: 'vertical', label: 'Opening upward' }, { value: 'noise', label: 'Dappled' }] }),
    def({ key: 'panel', label: 'Panel width', unit: 'mm', min: 600, max: 1800, step: 50, default: 1000 }),
    def({ key: 'offset', label: 'Offset from wall', unit: 'mm', min: 100, max: 600, step: 10, default: 250 }),
  ],
  palettes: [
    { name: 'Weathered corten', primary: '#8e4f30', secondary: '#7a4228', accent: '#5a5550' },
    { name: 'Early patina', primary: '#a8653d', secondary: '#945732', accent: '#615b55' },
    { name: 'Dark bronze', primary: '#5e4a3a', secondary: '#4f3e31', accent: '#77716a' },
  ],
  generate(face, openings, levels, orient, params, palette) {
    const c = new Ctx(corten, face, openings, levels, orient, params, palette);
    const pitch = c.m('pitch');
    const k = c.clim(1.15, 0.8);
    const dmin = c.m('dmin') * k, dmax = Math.min(pitch * 0.92, c.m('dmax') * k);
    const map = c.str('map');
    const pw = c.m('panel');
    const off = c.m('offset');
    const opens = c.openRects(0.25);
    const val = (u: number, z: number, zs: number, ze: number) => {
      if (map === 'vertical') return (z - zs) / Math.max(0.1, ze - zs);
      if (map === 'noise') return 0.5 + 0.25 * Math.sin(u * 2.1 + z * 0.7) + 0.25 * Math.sin(u * 0.63 - z * 1.9 + 1.3);
      let v = 0.15;
      for (const r of opens) {
        const du = Math.max(r.x0 - u, 0, u - r.x1), dz = Math.max(r.y0 - z, 0, z - r.y1);
        v = Math.max(v, 1 - Math.hypot(du, dz) / 0.9);
      }
      return v;
    };
    const rows: [number, number][] = [];
    const breaks = [c.bottom, ...face.levels.slice(1).map((l) => l.ffl - BAND), face.roofZ - BAND, c.top];
    for (let i = 0; i < breaks.length - 1; i++) rows.push([breaks[i], breaks[i + 1]]);
    let panels = 0, holes = 0, area = 0, open = 0;
    for (const [z0, z1] of rows) {
      for (const [b0, b1] of c.bays) {
        const n = Math.max(1, Math.round((b1 - b0) / pw));
        const w = (b1 - b0) / n;
        for (let p = 0; p < n; p++) {
          const panel = { x0: b0 + p * w + 0.008, x1: b0 + (p + 1) * w - 0.008, y0: z0 + 0.008, y1: z1 - 0.008 };
          const pieces = c.clearDoors(panel);
          if (!pieces.length) continue;
          panels++;
          for (const pc of pieces) {
            // tile the piece so 3D opacity and the ventilation check are local
            const nu = Math.max(1, Math.round((pc.x1 - pc.x0) / TILE)), nz = Math.max(1, Math.round((pc.y1 - pc.y0) / TILE));
            for (let iu = 0; iu < nu; iu++) for (let iz = 0; iz < nz; iz++) {
              const t = {
                x0: pc.x0 + ((pc.x1 - pc.x0) * iu) / nu, x1: pc.x0 + ((pc.x1 - pc.x0) * (iu + 1)) / nu,
                y0: pc.y0 + ((pc.y1 - pc.y0) * iz) / nz, y1: pc.y0 + ((pc.y1 - pc.y0) * (iz + 1)) / nz,
              };
              const need = c.req(t);
              const minD = need > 0 && need <= 1 ? Math.min(pitch * 0.95, Math.sqrt((4 * (need + 0.04) * pitch * pitch) / Math.PI)) : 0;
              const hs: [number, number, number][] = [];
              let a = 0;
              const g0u = Math.ceil((t.x0 - pc.x0 - pitch / 2) / pitch);
              const g0z = Math.ceil((t.y0 - pc.y0 - pitch / 2) / pitch);
              for (let gu = g0u; ; gu++) {
                const u = pc.x0 + pitch / 2 + gu * pitch;
                if (u > t.x1 - 1e-6) break;
                if (u < t.x0) continue;
                for (let gz = g0z; ; gz++) {
                  const z = pc.y0 + pitch / 2 + gz * pitch + (gu % 2 ? pitch / 2 : 0);
                  if (z > t.y1 - 1e-6) break;
                  if (z < t.y0) continue;
                  const v = Math.max(0, Math.min(1, val(u, z, z0, z1)));
                  const d = Math.max(minD, dmin + (dmax - dmin) * v);
                  hs.push([u, z, d / 2]);
                  a += (Math.PI * d * d) / 4;
                }
              }
              const ta = (t.x1 - t.x0) * (t.y1 - t.y0);
              // edge effects can leave a tile just short: grow its holes until it passes
              if (need > 0 && need <= 1 && a / ta < need + 0.01 && a > 0) {
                const f = Math.sqrt((need + 0.02) / (a / ta));
                a = 0;
                for (const h of hs) { h[2] = Math.min(pitch * 0.49, h[2] * f); a += Math.PI * h[2] * h[2]; }
              }
              const por = Math.min(0.9, a / ta);
              c.add({ kind: 'perf', role: 'screen', porosity: por, fill: palette.primary, u: t.x0, z: t.y0, w: t.x1 - t.x0, h: t.y1 - t.y0, d0: off, d1: off + 0.003, holes: hs, opacity: Math.max(0.3, 1 - por) });
              holes += hs.length; area += ta; open += a;
            }
          }
        }
      }
    }
    // rails on bands
    for (const b of c.bands) {
      if (b.kind !== 'floor' && b.kind !== 'roof') continue;
      for (const r of c.solid({ x0: 0, x1: c.width, y0: b.z0 + 0.05, y1: b.z0 + 0.15 }, 0.02)) {
        if (c.openings.some((o) => overlap(r, { x0: o.u0, x1: o.u1, y0: o.z0, y1: o.z1 }) > 0)) continue;
        c.add({ kind: 'box', role: 'solid', fill: palette.accent, u: r.x0, z: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0, d0: 0, d1: off });
      }
    }
    c.row('Perforated panel', `${Math.round(pw * 1000)} module × storey, 3 thk`, palette.name, panels, area, 'm²');
    c.row('Perforations', `ø${Math.round(dmin * 1000)}–${Math.round(dmax * 1000)} @ ${Math.round(pitch * 1000)}`, 'CNC punched', holes, open, 'm²');
    c.row('Sub-frame rail', sz(0.1, off), 'Galvanised steel', 1, 0, 'm');
    c.notes.push(`Average open area ${area > 0 ? Math.round((open / area) * 100) : 0}%.`);
    return c.finish();
  },
};
