import type { FacadeType } from './types.ts';
import { BAND, Ctx, def, sz } from './kit.ts';
import { GLASS_DARK, mix } from '../drawings/color.ts';

export const doubleskin: FacadeType = {
  id: 'doubleskin',
  num: 6,
  name: 'Double skin: glass + mesh',
  description: 'Inner skin of spandrel glass rainscreen between the windows; outer skin of tensioned stainless mesh on cantilever brackets at every slab, with a maintenance catwalk in the cavity. Mesh open area never drops below what the windows behind need.',
  params: [
    def({ key: 'cavity', label: 'Cavity depth', unit: 'mm', min: 400, max: 1200, step: 25, default: 700 }),
    def({ key: 'por', label: 'Mesh open area', unit: '%', min: 30, max: 80, step: 1, default: 55 }),
    def({ key: 'panel', label: 'Mesh panel width', unit: 'mm', min: 1000, max: 3000, step: 50, default: 1500 }),
    def({ key: 'bracket', label: 'Bracket spacing', unit: 'mm', min: 900, max: 2400, step: 50, default: 1500 }),
    def({ key: 'catwalk', label: 'Catwalk', unit: '', kind: 'toggle', default: true }),
    def({ key: 'weave', label: 'Weave', unit: '', kind: 'select', default: 'medium', options: [
      { value: 'fine', label: 'Fine' }, { value: 'medium', label: 'Medium' }, { value: 'coarse', label: 'Coarse' }] }),
  ],
  palettes: [
    { name: 'Satin stainless', primary: '#a9aca9', secondary: '#4f5856', accent: '#7f8280' },
    { name: 'Bronze mesh', primary: '#9b7d5a', secondary: '#4a4a44', accent: '#77695a' },
    { name: 'Black mesh', primary: '#4a4b4a', secondary: '#5b6462', accent: '#6c6d6b' },
  ],
  generate(face, openings, levels, orient, params, palette) {
    const c = new Ctx(doubleskin, face, openings, levels, orient, params, palette);
    const cav = c.m('cavity') * c.clim(0.9, 1.2);
    const maxNeed = Math.max(0, ...c.openings.filter((o) => !o.door).map((o) => o.reqRatio));
    const por = Math.max(maxNeed + 0.05, Math.min(0.85, c.pct('por') * c.clim(1.15, 0.85)));
    const pw = c.m('panel');
    const pitch = { fine: 0.03, medium: 0.06, coarse: 0.1 }[c.str('weave') as 'fine' | 'medium' | 'coarse'] ?? 0.06;
    const glass = mix(palette.secondary, GLASS_DARK, 0.4);
    // inner skin: spandrel glass with mullions on a 1.2 module, clear of openings
    let spandrel = 0;
    for (const r of c.solid({ x0: 0, x1: c.width, y0: c.bottom, y1: c.top }, 0.02)) {
      c.add({ kind: 'box', role: 'solid', fill: glass, u: r.x0, z: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0, d0: 0, d1: 0.04 });
      spandrel += (r.x1 - r.x0) * (r.y1 - r.y0);
    }
    for (let u = 1.2; u < c.width - 0.1; u += 1.2) {
      for (const r of c.solid({ x0: u - 0.025, x1: u + 0.025, y0: c.bottom, y1: c.top }, 0.02)) {
        c.add({ kind: 'box', role: 'solid', fill: palette.accent, u: r.x0, z: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0, d0: 0, d1: 0.07 });
      }
    }
    // brackets + catwalk at each slab band and roof
    let brackets = 0, walk = 0;
    for (const b of c.bands) {
      if (b.kind !== 'floor' && b.kind !== 'roof') continue;
      const n = Math.max(2, Math.round(c.width / c.m('bracket')) + 1);
      for (let i = 0; i < n; i++) {
        const u = 0.06 + ((c.width - 0.12) * i) / (n - 1);
        c.add({ kind: 'box', role: 'solid', fill: palette.accent, u: u - 0.04, w: 0.08, z: b.z0 + 0.05, h: 0.2, d0: 0, d1: cav + 0.03 });
        brackets++;
      }
      if (c.bool('catwalk')) {
        c.add({ kind: 'box', role: 'solid', fill: mix(palette.accent, '#ffffff', 0.25), u: 0, w: c.width, z: b.z1 - 0.05, h: 0.05, d0: 0.08, d1: cav - 0.05 });
        walk += c.width;
      }
    }
    // outer mesh skin
    const rows: [number, number][] = [];
    const breaks = [c.bottom, ...face.levels.slice(1).map((l) => l.ffl - BAND), face.roofZ - BAND, c.top];
    for (let i = 0; i < breaks.length - 1; i++) rows.push([breaks[i], breaks[i + 1]]);
    let mesh = 0, panels = 0;
    for (const [z0, z1] of rows) {
      const n = Math.max(1, Math.round(c.width / pw));
      for (let p = 0; p < n; p++) {
        const rect = { x0: (c.width * p) / n + 0.01, x1: (c.width * (p + 1)) / n - 0.01, y0: z0 + 0.01, y1: z1 - 0.01 };
        for (const r of c.clearDoors(rect, 0.15)) {
          c.add({ kind: 'mesh', role: 'screen', porosity: por, fill: palette.primary, u: r.x0, z: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0, d0: cav, d1: cav + 0.012, pitch, opacity: Math.max(0.25, 1 - por) });
          mesh += (r.x1 - r.x0) * (r.y1 - r.y0);
          panels++;
        }
      }
    }
    c.row('Stainless mesh panel', `${Math.round(pw * 1000)} × storey, ${Math.round(por * 100)}% open`, palette.name, panels, mesh, 'm²');
    c.row('Spandrel glass', '6 + 12 + 6 opaque', 'Enamelled glass', 1, spandrel, 'm²');
    c.row('Cantilever bracket', sz(0.08, 0.2, cav), 'Stainless steel', brackets, 0);
    if (walk) c.row('Catwalk grating', sz(cav - 0.13), 'GI grating', walk, 0, 'm');
    return c.finish();
  },
};
