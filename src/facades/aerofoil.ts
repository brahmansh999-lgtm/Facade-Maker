import type { FacadeType } from './types.ts';
import { Ctx, def, freeIntervals, sz } from './kit.ts';

const BLADE_T = 0.06;
const POST = 0.07;

export const aerofoil: FacadeType = {
  id: 'aerofoil',
  num: 5,
  name: 'Aerofoil aluminium louvres',
  description: 'Extruded aluminium aerofoil blades spanning between slim mullions on the grid. Blade chord follows the sun cut-off: depth = pitch / tan(cut-off). With climate response on, the cut-off is this face’s vertical shadow angle at peak exposure.',
  params: [
    def({ key: 'pitch', label: 'Blade pitch', unit: 'mm', min: 150, max: 600, step: 10, default: 420 }),
    def({ key: 'depth', label: 'Blade depth', unit: 'mm', min: 100, max: 600, step: 10, default: 250 }),
    def({ key: 'auto', label: 'Depth from cut-off', unit: '', kind: 'toggle', default: true }),
    def({ key: 'cutoff', label: 'Sun cut-off angle', unit: '°', min: 20, max: 75, step: 1, default: 45 }),
    def({ key: 'tilt', label: 'Blade tilt', unit: '°', min: 0, max: 45, step: 1, default: 12 }),
    def({ key: 'offset', label: 'Offset from wall', unit: 'mm', min: 50, max: 300, step: 10, default: 100 }),
    def({ key: 'cover', label: 'Coverage', unit: '', kind: 'select', default: 'full', options: [
      { value: 'full', label: 'Full storey' }, { value: 'windows', label: 'Window bands only' }] }),
  ],
  palettes: [
    { name: 'Anodised silver', primary: '#cdd0d2', secondary: '#b2b6b9', accent: '#7c8185' },
    { name: 'Gloss white', primary: '#f0efeb', secondary: '#dddcd7', accent: '#9a9da0' },
    { name: 'Bronze anodised', primary: '#8c6d4f', secondary: '#765a40', accent: '#5a4c40' },
  ],
  generate(face, openings, levels, orient, params, palette) {
    const c = new Ctx(aerofoil, face, openings, levels, orient, params, palette);
    const pitch = Math.max(0.12, c.m('pitch') * c.clim(1.15, 0.85));
    const cutoff = orient.climate ? orient.cutoff : c.num('cutoff');
    const depth = c.bool('auto') ? Math.min(0.6, Math.max(0.1, pitch / Math.tan((cutoff * Math.PI) / 180))) : c.m('depth');
    const tilt0 = c.num('tilt');
    const off = c.m('offset');
    const doors = c.doorRects(0.1);
    let blades = 0, bladeLen = 0, posts = 0;

    // posts on grid lines, full height
    for (const u of c.lines) {
      const u0 = Math.max(0, Math.min(c.width - POST, u - POST / 2));
      for (const r of c.solid({ x0: u0, x1: u0 + POST, y0: c.bottom, y1: c.top }, 0.02)) {
        c.add({ kind: 'box', role: 'solid', fill: palette.secondary, u: r.x0, z: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0, d0: 0, d1: off + depth });
        posts++;
      }
    }
    const blade = (u0: number, u1: number, z: number, tilt: number, por: number) => {
      const a = (tilt * Math.PI) / 180;
      // aerofoil section in (z, d): symmetric lens, thickest at 30% chord, rotated down-outward about its root
      const sec: [number, number][] = [];
      const N = 7;
      for (let i = 0; i <= N; i++) { const x = i / N; sec.push([BLADE_T / 2 + (BLADE_T / 2) * Math.pow(Math.sin(Math.PI * Math.pow(x, 0.75)), 0.9), x * depth]); }
      for (let i = N - 1; i >= 1; i--) { const x = i / N; sec.push([BLADE_T / 2 - (BLADE_T / 2) * Math.pow(Math.sin(Math.PI * Math.pow(x, 0.75)), 0.9), x * depth]); }
      const pts: [number, number][] = sec.map(([zz, dd]) => [
        z + zz * Math.cos(a) - dd * Math.sin(a), off + zz * Math.sin(a) + dd * Math.cos(a),
      ]);
      c.add({ kind: 'prismU', role: 'screen', porosity: por, fill: palette.primary, u0, u1, pts });
      blades++;
      bladeLen += u1 - u0;
    };
    const opaque = (tilt: number) => BLADE_T * Math.cos((tilt * Math.PI) / 180) + depth * Math.sin((tilt * Math.PI) / 180);

    for (const s of c.storeys) {
      c.bays.forEach(([b0, b1]) => {
        const u0 = b0 + POST / 2, u1 = b1 - POST / 2;
        let zLo = s.z0 + 0.1, zHi = s.z1;
        if (c.str('cover') === 'windows') {
          const ws = c.openings.filter((o) => !o.door && o.u1 > u0 && o.u0 < u1 && o.z0 >= s.z0 - 1e-6 && o.z1 <= s.z1 + 0.5);
          if (!ws.length) return;
          zLo = Math.min(...ws.map((o) => o.z0)); zHi = Math.min(s.z1, Math.max(...ws.map((o) => o.z1)) + pitch);
        }
        for (let z = zHi - pitch; z >= zLo - 1e-6; z -= pitch) {
          const rect = { x0: u0, x1: u1, y0: z - depth * Math.sin((tilt0 * Math.PI) / 180), y1: z + BLADE_T };
          const need = c.req(rect);
          let tilt = tilt0;
          let por = Math.max(0, 1 - opaque(tilt) / pitch);
          if (need > 0 && need <= 1 && por < need) { tilt = 0; por = Math.max(0, 1 - opaque(0) / pitch); }
          for (const [a, b] of freeIntervals(u0, u1, rect.y0, rect.y1, doors)) blade(a, b, z, tilt, por);
        }
      });
    }
    c.row('Aerofoil blade', sz(depth, BLADE_T), palette.name, blades, 0);
    c.row('Aerofoil blade (length)', sz(depth, BLADE_T), palette.name, bladeLen, 0, 'm');
    c.row('Aluminium mullion', sz(POST, off + depth), palette.name, posts, 0);
    c.notes.push(`Cut-off ${cutoff.toFixed(0)}° → blade depth ${Math.round(depth * 1000)} mm at ${Math.round(pitch * 1000)} mm pitch.`);
    return c.finish();
  },
};
