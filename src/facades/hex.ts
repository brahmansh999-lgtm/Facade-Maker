import type { FacadeType } from './types.ts';
import { Ctx, def } from './kit.ts';
import { overlap } from '../geometry/rect.ts';
import { rng } from '../model/units.ts';
import { shade } from '../drawings/color.ts';

type P2 = [number, number];

/** clip a convex polygon to an axis-aligned rect (Sutherland–Hodgman) */
function clipRect(poly: P2[], x0: number, x1: number, y0: number, y1: number): P2[] {
  const edges: [(p: P2) => boolean, (a: P2, b: P2) => P2][] = [
    [(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((x0 - a[0]) / (b[0] - a[0])) * (b[1] - a[1])]],
    [(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((x1 - a[0]) / (b[0] - a[0])) * (b[1] - a[1])]],
    [(p) => p[1] >= y0, (a, b) => [a[0] + ((y0 - a[1]) / (b[1] - a[1])) * (b[0] - a[0]), y0]],
    [(p) => p[1] <= y1, (a, b) => [a[0] + ((y1 - a[1]) / (b[1] - a[1])) * (b[0] - a[0]), y1]],
  ];
  let out = poly;
  for (const [inside, cut] of edges) {
    const src = out;
    out = [];
    for (let i = 0; i < src.length; i++) {
      const a = src[i], b = src[(i + 1) % src.length];
      if (inside(b)) { if (!inside(a)) out.push(cut(a, b)); out.push(b); }
      else if (inside(a)) out.push(cut(a, b));
    }
    if (!out.length) break;
  }
  return out;
}

export const hex: FacadeType = {
  id: 'hex',
  num: 9,
  name: 'Faceted hex tiles',
  description: 'Pressed-metal hexagonal pyramids clipped to a dark backing skin. Peak height follows a parametric field, so the facade catches light differently across the day. Tiles step back around every opening, leaving a crisp pixel frame to the glass.',
  params: [
    def({ key: 'size', label: 'Tile width', unit: 'mm', min: 300, max: 1200, step: 25, default: 1000 }),
    def({ key: 'gap', label: 'Joint', unit: 'mm', min: 10, max: 80, step: 2, default: 24 }),
    def({ key: 'peak', label: 'Peak height', unit: 'mm', min: 0, max: 250, step: 5, default: 110 }),
    def({ key: 'field', label: 'Peak field', unit: '', kind: 'select', default: 'gradient', options: [
      { value: 'gradient', label: 'Rising with height' }, { value: 'sun', label: 'Sun exposure' }, { value: 'random', label: 'Scatter' }, { value: 'flat', label: 'Flat tiles' }] }),
    def({ key: 'tone', label: 'Tone variation', unit: '%', min: 0, max: 60, step: 1, default: 25 }),
  ],
  palettes: [
    { name: 'Satin aluminium', primary: '#c9cbcc', secondary: '#aeb2b4', accent: '#2d3135' },
    { name: 'Rose gold', primary: '#d2ac98', secondary: '#bb9280', accent: '#3a3230' },
    { name: 'Gunmetal', primary: '#6b7176', secondary: '#575c61', accent: '#1f2225' },
  ],
  generate(face, openings, levels, orient, params, palette) {
    const c = new Ctx(hex, face, openings, levels, orient, params, palette);
    const F = c.m('size');
    const s = F / Math.sqrt(3);
    const gap = c.m('gap');
    const peak = c.m('peak') * c.clim(0.8, 1.3);
    const field = c.str('field');
    const toneVar = c.pct('tone');
    const rnd = rng(5 + Math.round(face.width * 13));
    const opens = c.openRects(0.04);
    const base = 0.04;
    // dark backing skin
    for (const r of c.solid({ x0: 0, x1: c.width, y0: c.bottom, y1: c.top }, 0)) {
      c.add({ kind: 'box', role: 'solid', fill: palette.accent, u: r.x0, z: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0, d0: 0, d1: base });
    }
    const rs = s - gap / Math.sqrt(3);
    let tiles = 0, cut = 0, area = 0;
    const rows = Math.ceil((c.top - c.bottom) / (1.5 * s)) + 1;
    for (let j = 0; j < rows; j++) {
      const cz = c.bottom + j * 1.5 * s;
      const shift = j % 2 ? F / 2 : 0;
      for (let cu = shift - F; cu < c.width + F; cu += F) {
        const poly: P2[] = [];
        for (let k = 0; k < 6; k++) {
          const a = Math.PI / 2 + (k * Math.PI) / 3;
          poly.push([cu + rs * Math.cos(a), cz + rs * Math.sin(a)]);
        }
        const bb = { x0: cu - rs, x1: cu + rs, y0: cz - rs, y1: cz + rs };
        if (opens.some((o) => overlap(o, bb) > 0)) continue;
        const clipped = clipRect(poly, 0, c.width, c.bottom, c.top);
        if (clipped.length < 3) continue;
        const t = (cz - c.bottom) / (c.top - c.bottom);
        const fv = field === 'gradient' ? 0.15 + 0.85 * t : field === 'sun' ? 0.3 + 0.7 * orient.exposure * (0.7 + 0.3 * rnd()) : field === 'random' ? rnd() : 0;
        const tone = shade(rnd() < 0.5 ? palette.primary : palette.secondary, (rnd() - 0.5) * toneVar);
        const whole = clipped.length === 6 && peak * fv > 0.005;
        if (whole) {
          const apex: [number, number, number] = [cu, cz, base + 0.005 + peak * fv];
          for (let k = 0; k < 6; k++) {
            const a = poly[k], b = poly[(k + 1) % 6];
            c.add({ kind: 'facet', role: 'solid', fill: tone, pts: [[a[0], a[1], base + 0.005], [b[0], b[1], base + 0.005], apex] });
          }
        } else {
          c.add({ kind: 'facet', role: 'solid', fill: tone, pts: clipped.map(([u, z]) => [u, z, base + 0.005] as [number, number, number]) });
          if (clipped.length !== 6) cut++;
        }
        tiles++;
        area += (3 * Math.sqrt(3) / 2) * rs * rs;
      }
    }
    c.row('Hex pyramid tile', `${Math.round(F * 1000)} A/F, peak ≤ ${Math.round(peak * 1000)}`, palette.name, tiles - cut, 0);
    c.row('Hex tile, cut at edge', `${Math.round(F * 1000)} A/F`, palette.name, cut, 0);
    c.row('Tile cladding (gross)', '2 mm pressed', palette.name, 1, area, 'm²');
    c.row('Backing rainscreen', 'ACM 4 mm', 'Black ACM', 1, 0, 'nr');
    return c.finish();
  },
};
