import type { FacadeType, Prim } from './types.ts';
import { Ctx, def, sz } from './kit.ts';
import { sweepHitsRect } from '../drawings/primDraw.ts';

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export const flow: FacadeType = {
  id: 'flow',
  num: 2,
  name: 'Fluid flow lines',
  description: 'Continuous aluminium fins that run the full height of the house like streamlines in water: they part around every window and door and close up again beyond it, with a slow meander and a depth swell travelling across the face. Spacing tightens on the hot faces.',
  params: [
    def({ key: 'pitch', label: 'Line spacing', unit: 'mm', min: 250, max: 1000, step: 10, default: 520 }),
    def({ key: 'fin', label: 'Fin depth', unit: 'mm', min: 60, max: 500, step: 10, default: 200 }),
    def({ key: 'thick', label: 'Fin thickness', unit: 'mm', min: 30, max: 120, step: 5, default: 50 }),
    def({ key: 'clear', label: 'Clearance at openings', unit: 'mm', min: 100, max: 600, step: 10, default: 220 }),
    def({ key: 'meander', label: 'Meander', unit: 'mm', min: 0, max: 400, step: 10, default: 120 }),
    def({ key: 'swell', label: 'Depth swell', unit: '%', min: 0, max: 100, step: 1, default: 60 }),
  ],
  palettes: [
    { name: 'Liquid white', primary: '#f0efea', secondary: '#dddcd6', accent: '#8d9093' },
    { name: 'Mirror stainless', primary: '#c3c7ca', secondary: '#a9aeb2', accent: '#55595d' },
    { name: 'Anodised bronze', primary: '#8c6d50', secondary: '#7a5f46', accent: '#3d342c' },
  ],
  generate(face, openings, levels, orient, params, palette) {
    const c = new Ctx(flow, face, openings, levels, orient, params, palette);
    const pitch = c.m('pitch') * c.clim(1.15, 0.85);
    const fin = c.m('fin') * c.clim(0.9, 1.2);
    const w = c.m('thick');
    const clear = c.m('clear');
    const amp = c.m('meander');
    const swell = c.pct('swell');
    const off = 0.06;
    const W = c.width, z0 = c.bottom, z1 = c.top;
    const hits = [...c.openRects(0.02), ...c.doorRects(0.04)];

    // each opening is an obstacle: lines within its reach are squeezed aside while they pass it
    const obs = c.openings.map((o) => {
      const a = (o.u1 - o.u0) / 2 + clear + w / 2;
      return { cu: (o.u0 + o.u1) / 2, a, reach: a + Math.max(1.2, a * 1.4), lo: (o.door ? z0 - 1 : o.z0) - clear, hi: o.z1 + clear, ramp: Math.max(0.9, a * 1.3) };
    });
    const deflect = (u: number, z: number) => {
      let sw = 0, sd = 0, smax = 0;
      for (const b of obs) {
        const du = u - b.cu;
        if (Math.abs(du) >= b.reach) continue;
        const s = z < b.lo ? smooth(1 - (b.lo - z) / b.ramp) : z > b.hi ? smooth(1 - (z - b.hi) / b.ramp) : 1;
        if (s <= 0) continue;
        // map [cu−reach, cu] → [cu−reach, cu−a] (and mirrored on the right)
        const sgn = du < 0 || (du === 0 && b.cu > W / 2) ? -1 : 1;
        const target = b.cu + sgn * (b.a + (Math.abs(du) * (b.reach - b.a)) / b.reach);
        sw += s; sd += s * (target - u); smax = Math.max(smax, s);
      }
      return sw > 0 ? (sd / sw) * smax : 0;
    };

    const n = Math.max(2, Math.round(W / pitch));
    const dz = 0.15;
    let lines = 0, len = 0, pieces = 0;
    for (let i = 0; i <= n; i++) {
      const u0 = (W * i) / n;
      const phase = (u0 / 6) * Math.PI * 2;
      const depth = off + fin * (1 + swell * 0.6 * Math.sin((u0 / W) * Math.PI * 2 - 0.6));
      let run: [number, number, number][] = [];
      const flush = () => {
        if (run.length >= 3) {
          const p: Prim = { kind: 'sweep', role: 'solid', fill: palette.primary, pts: run, w, d0: off };
          c.add(p);
          pieces++;
          for (let k = 1; k < run.length; k++) len += Math.hypot(run[k][0] - run[k - 1][0], run[k][1] - run[k - 1][1]);
        }
        run = [];
      };
      for (let z = z0; z <= z1 + 1e-6; z += dz) {
        const zz = Math.min(z, z1);
        const edgeFade = Math.min(1, u0 / 1.2, (W - u0) / 1.2);
        let u = u0 + amp * edgeFade * Math.sin((zz / 7) * Math.PI * 2 + phase);
        u += deflect(u, zz);
        const ok = u >= w / 2 && u <= W - w / 2;
        const d = depth * (1 + 0.25 * swell * Math.sin((zz / 5) * Math.PI * 2 + phase * 0.5));
        const pt: [number, number, number] = [Math.max(w / 2, Math.min(W - w / 2, u)), zz, d];
        // never let a fin cross an opening: break the line around any stray segment
        const inside = hits.some((r) => pt[0] > r.x0 - w && pt[0] < r.x1 + w && pt[1] > r.y0 - w && pt[1] < r.y1 + w);
        if (!ok || inside) { flush(); continue; }
        const prev = run[run.length - 1];
        if (prev && hits.some((r) => sweepHitsRect({ kind: 'sweep', role: 'solid', fill: '', pts: [prev, pt], w, d0: off }, r))) flush();
        run.push(pt);
      }
      flush();
      lines++;
    }

    c.row('Flow fin, swept', sz(w, fin), 'Aluminium, ' + palette.name, pieces, 0);
    c.row('Flow fin (length)', sz(w, fin), 'Aluminium, ' + palette.name, len, 0, 'm');
    c.row('Fin bracket', '@ 1200 c/c', 'Stainless steel', Math.ceil(len / 1.2), 0);
    c.notes.push(`${lines} streamlines at ${Math.round(pitch * 1000)} mm, parting around ${c.openings.length} openings.`);
    return c.finish();
  },
};
