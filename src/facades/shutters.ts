import type { FacadeType } from './types.ts';
import { Ctx, def } from './kit.ts';
import { overlap } from '../geometry/rect.ts';
import { shade } from '../drawings/color.ts';
import { clamp } from '../model/units.ts';

export const shutters: FacadeType = {
  id: 'shutters',
  num: 13,
  name: 'Operable timber shutters',
  description: 'Louvred timber shutters to every window, either pivoting on a central pin or sliding on a head track over the wall. The state slider is live; slat angle is relaxed automatically wherever a closed shutter would starve the room of air.',
  params: [
    def({ key: 'mode', label: 'Operation', unit: '', kind: 'select', default: 'pivot', options: [
      { value: 'pivot', label: 'Pivoting' }, { value: 'sliding', label: 'Sliding' }] }),
    def({ key: 'open', label: 'Open', unit: '%', min: 0, max: 100, step: 1, default: 35 }),
    def({ key: 'leaves', label: 'Leaves per window', unit: 'nr', min: 1, max: 4, step: 1, default: 2 }),
    def({ key: 'pitch', label: 'Slat pitch', unit: 'mm', min: 30, max: 100, step: 5, default: 55 }),
    def({ key: 'slat', label: 'Slat angle', unit: '°', min: 0, max: 75, step: 1, default: 40 }),
    def({ key: 'frame', label: 'Leaf depth', unit: 'mm', min: 30, max: 80, step: 5, default: 45 }),
  ],
  palettes: [
    { name: 'Oiled iroko', primary: '#9c6e48', secondary: '#87603e', accent: '#d9d2c3' },
    { name: 'Painted sage', primary: '#8e9a80', secondary: '#7b876e', accent: '#e4ded1' },
    { name: 'Bleached oak', primary: '#c9b48f', secondary: '#b5a07c', accent: '#dcd5c6' },
  ],
  generate(face, openings, levels, orient, params, palette) {
    const c = new Ctx(shutters, face, openings, levels, orient, params, palette);
    const pivot = c.str('mode') === 'pivot';
    const open = clamp(c.pct('open') * c.clim(1.25, 0.6), 0, 1);
    const nLeaves = Math.round(c.num('leaves'));
    const pitch = c.m('pitch');
    const fd = c.m('frame');
    const slat0 = c.num('slat');
    const slatW = pitch * 0.9, slatT = 0.012;
    const slatPor = (a: number) => Math.max(0, 1 - (slatW * Math.sin((a * Math.PI) / 180) + slatT * Math.cos((a * Math.PI) / 180)) / pitch);
    let leaves = 0, track = 0, relaxed = 0;
    const wins = c.openings.filter((o) => !o.door && o.u1 - o.u0 >= 0.5);
    for (const o of wins) {
      const W = o.u1 - o.u0, H = o.z1 - o.z0;
      const lw = W / nLeaves;
      const others = c.openings.filter((x) => x !== o).map((x) => ({ x0: x.u0 - 0.05, x1: x.u1 + 0.05, y0: x.z0, y1: x.z1 }));
      // coverage of the opening by leaves in this state
      let coverage: number;
      let slide = 0;
      if (pivot) {
        const th = (open * 85 * Math.PI) / 180;
        coverage = Math.min(1, (lw * Math.cos(th) + fd * Math.sin(th)) / lw);
      } else {
        const half = Math.ceil(nLeaves / 2);
        slide = open * lw * half;
        // never slide onto a neighbouring opening
        for (let s = slide; s >= 0; s -= 0.05) {
          const l = { x0: o.u0 - s, x1: o.u0 - s + lw * half, y0: o.z0, y1: o.z1 };
          const r = { x0: o.u1 + s - lw * (nLeaves - half), x1: o.u1 + s, y0: o.z0, y1: o.z1 };
          if (!others.some((q) => overlap(q, l) > 0 || overlap(q, r) > 0) && l.x0 >= 0 && r.x1 <= c.width) { slide = s; break; }
          slide = Math.max(0, s - 0.05);
        }
        coverage = Math.max(0, 1 - (2 * slide) / W);
      }
      let slat = slat0;
      while (1 - coverage * (1 - slatPor(slat)) < o.reqRatio && slat > 0) { slat = Math.max(0, slat - 5); relaxed++; }
      const por = 1 - coverage * (1 - slatPor(slat));
      for (let i = 0; i < nLeaves; i++) {
        if (pivot) {
          const uc = o.u0 + lw * (i + 0.5);
          const th = open * 85 * (i % 2 ? -1 : 1);
          const dc = 0.05 + fd / 2 + (lw / 2) * Math.abs(Math.sin((th * Math.PI) / 180));
          c.add({ kind: 'box', role: 'screen', porosity: por, fill: palette.primary, u: uc - lw / 2 + 0.005, w: lw - 0.01, z: o.z0, h: H, d0: dc - fd / 2, d1: dc + fd / 2, rot: th });
          // slat lines on the leaf face
          const a = (th * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
          const ua = uc - (lw / 2) * cs, ub = uc + (lw / 2) * cs;
          const da = dc + fd / 2 - (lw / 2) * sn, db = dc + fd / 2 + (lw / 2) * sn;
          for (let z = o.z0 + pitch; z < o.z1 - pitch / 2; z += pitch) {
            c.add({ kind: 'line', role: 'screen', porosity: 0.98, fill: shade(palette.primary, 0.45), width: 0.006, pts: [[ua, z, da + 0.002], [ub, z, db + 0.002]] });
          }
        } else {
          const half = Math.ceil(nLeaves / 2);
          const left = i < half;
          const u0 = left ? o.u0 - slide + lw * i : o.u1 + slide - lw * (nLeaves - i);
          const layer = 0.06 + (i % 2) * (fd + 0.01);
          c.add({ kind: 'box', role: 'screen', porosity: por, fill: palette.secondary, u: u0, w: lw, z: o.z0, h: H, d0: layer, d1: layer + fd });
          for (let z = o.z0 + pitch; z < o.z1 - pitch / 2; z += pitch) {
            const a = (slat * Math.PI) / 180;
            const pts: [number, number][] = [[0, 0], [slatT, 0], [slatT, slatW], [0, slatW]].map(([zz, dd]) => [
              z + zz * Math.cos(a) - (dd - slatW / 2) * Math.sin(a), layer + fd / 2 + zz * Math.sin(a) + (dd - slatW / 2) * Math.cos(a),
            ]);
            c.add({ kind: 'prismU', role: 'screen', porosity: por, fill: palette.primary, u0: u0 + 0.04, u1: u0 + lw - 0.04, pts });
          }
        }
        leaves++;
      }
      if (!pivot) {
        // head track spanning the travel, clear of other openings
        const span = { x0: Math.max(0, o.u0 - lw * Math.ceil(nLeaves / 2)), x1: Math.min(c.width, o.u1 + lw * Math.floor(nLeaves / 2)), y0: o.z1 + 0.02, y1: o.z1 + 0.1 };
        for (const r of c.solid(span, 0.02)) {
          c.add({ kind: 'box', role: 'solid', fill: shade(palette.accent, 0.4), u: r.x0, w: r.x1 - r.x0, z: r.y0, h: r.y1 - r.y0, d0: 0, d1: 0.08 + 2 * fd });
          track += r.x1 - r.x0;
        }
      }
    }
    c.row('Louvred shutter leaf', `${pivot ? 'pivot' : 'sliding'}, ${Math.round(fd * 1000)} deep`, palette.name, leaves, 0);
    c.row(pivot ? 'Pivot pin set' : 'Bottom guide + roller set', 'Stainless', 'SS 316', leaves, 0);
    if (track) c.row('Head track', '80 × 60', 'Anodised aluminium', track, 0, 'm');
    c.notes.push(`State ${Math.round(open * 100)}% open${relaxed ? `; slats relaxed on ${relaxed} step(s) to keep free area` : ''}.`);
    return c.finish();
  },
};
