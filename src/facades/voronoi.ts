import type { FacadeType, Prim } from './types.ts';
import { Ctx, def, sz } from './kit.ts';
import { barHitsRect } from '../drawings/primDraw.ts';
import { overlap } from '../geometry/rect.ts';
import { rng } from '../model/units.ts';
import { mix, shade } from '../drawings/color.ts';

export type P2 = [number, number];

/** keep the part of a convex polygon on the near side of the bisector between seeds a and b */
function clipBisector(poly: P2[], a: P2, b: P2): P2[] {
  const nx = b[0] - a[0], ny = b[1] - a[1];
  const k = (nx * (a[0] + b[0]) + ny * (a[1] + b[1])) / 2;
  const f = (p: P2) => nx * p[0] + ny * p[1] - k;
  const out: P2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const fp = f(p), fq = f(q);
    if (fp <= 0) out.push(p);
    if (fp * fq < 0) { const t = fp / (fp - fq); out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); }
  }
  return out;
}

/** inset a convex CCW polygon by g (offset every edge inward, intersect neighbours); null if it collapses */
export function inset(poly: P2[], g: number): P2[] | null {
  const n = poly.length;
  const lines = poly.map((p, i) => {
    const q = poly[(i + 1) % n];
    const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l;   // inward normal for CCW
    return { p: [p[0] + nx * g, p[1] + ny * g] as P2, d: [dx / l, dy / l] as P2 };
  });
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const A = lines[(i + n - 1) % n], B = lines[i];
    const den = A.d[0] * B.d[1] - A.d[1] * B.d[0];
    if (Math.abs(den) < 1e-9) { out.push(B.p); continue; }
    const t = ((B.p[0] - A.p[0]) * B.d[1] - (B.p[1] - A.p[1]) * B.d[0]) / den;
    out.push([A.p[0] + A.d[0] * t, A.p[1] + A.d[1] * t]);
  }
  return area(out) > 0.02 && area(out) < area(poly) ? out : null;
}

export const area = (poly: P2[]) => {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
};
export const centroid = (poly: P2[]): P2 => [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];


/**
 * Voronoi cells over a face. Every opening gets its own seed with a reserved disc, so each window
 * or door sits inside one cell; the other seeds are Poisson darts whose spacing follows `field`.
 */
export function voronoiCells(c: Ctx, S: number, field: string, rnd: () => number): P2[][] {
  const x0 = 0, x1 = c.width, y0 = c.bottom, y1 = c.top;
  const seeds: { p: P2; r: number }[] = [];
  for (const o of c.openings) {
    const r = Math.hypot(o.u1 - o.u0, (o.door ? o.z1 - c.bottom : o.z1 - o.z0)) / 2 + 0.12;
    seeds.push({ p: [(o.u0 + o.u1) / 2, o.door ? (c.bottom + o.z1) / 2 : (o.z0 + o.z1) / 2], r });
  }
  const spacing = (p: P2) => {
    const t = (p[1] - y0) / (y1 - y0);
    if (field === 'rising') return S * (1.1 - 0.3 * t);
    if (field === 'openings') {
      const dn = Math.min(...c.openings.map((o) => Math.hypot(Math.max(o.u0 - p[0], 0, p[0] - o.u1), Math.max(o.z0 - p[1], 0, p[1] - o.z1))), 9);
      return S * (0.6 + 0.5 * Math.min(1, dn / 2.5));
    }
    if (field === 'diagonal') return S * (0.65 + 0.6 * ((p[0] - x0) / Math.max(1, x1 - x0) * 0.5 + t * 0.5));
    return S;
  };
  const tries = Math.ceil(((x1 - x0) * (y1 - y0)) / (S * S * 0.25)) * 30;
  for (let k = 0; k < tries; k++) {
    const p: P2 = [x0 + rnd() * (x1 - x0), y0 + rnd() * (y1 - y0)];
    const sp = spacing(p) * 0.82;
    if (seeds.some((s, i) => Math.hypot(s.p[0] - p[0], s.p[1] - p[1]) < (i < c.openings.length ? 2 * s.r : sp))) continue;
    seeds.push({ p, r: sp });
  }
  const cells: P2[][] = [];
  for (let i = 0; i < seeds.length; i++) {
    let poly: P2[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    for (let j = 0; j < seeds.length && poly.length; j++) if (j !== i) poly = clipBisector(poly, seeds[i].p, seeds[j].p);
    if (poly.length >= 3) cells.push(poly);
  }
  return cells;
}

/** keep the part of a convex polygon where a·u + b·z ≤ k */
function clipHalf(poly: P2[], a: number, b: number, k: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const fp = a * p[0] + b * p[1] - k, fq = a * q[0] + b * q[1] - k;
    if (fp <= 0) out.push(p);
    if (fp * fq < 0) { const t = fp / (fp - fq); out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); }
  }
  return out;
}

/** convex pieces of a convex polygon that stay clear of every rect (left, right, below, above each one) */
export function cutAround(poly: P2[], rects: { x0: number; x1: number; y0: number; y1: number }[]): P2[][] {
  let pieces = [poly];
  for (const r of rects) {
    pieces = pieces.flatMap((pc) => {
      const us = pc.map((q) => q[0]), zs = pc.map((q) => q[1]);
      if (Math.max(...us) <= r.x0 || Math.min(...us) >= r.x1 || Math.max(...zs) <= r.y0 || Math.min(...zs) >= r.y1) return [pc];
      const mid = clipHalf(clipHalf(pc, -1, 0, -r.x0), 1, 0, r.x1);
      // left of, right of, below and above the rect
      return [clipHalf(pc, 1, 0, r.x0), clipHalf(pc, -1, 0, -r.x1), clipHalf(mid, 0, 1, r.y0), clipHalf(mid, 0, -1, -r.y1)];
    });
  }
  return pieces.filter((q) => q.length >= 3 && area(q) > 0.04);
}

/** every Voronoi edge once */
export function uniqueEdges(cells: P2[][]): [P2, P2][] {
  const seen = new Set<string>(), out: [P2, P2][] = [];
  const key = (p: P2) => `${Math.round(p[0] * 200)},${Math.round(p[1] * 200)}`;
  for (const poly of cells) for (let k = 0; k < poly.length; k++) {
    const a = poly[k], b = poly[(k + 1) % poly.length];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.05) continue;
    const ka = key(a), kb = key(b), kk = ka < kb ? ka + kb : kb + ka;
    if (seen.has(kk)) continue;
    seen.add(kk);
    out.push([a, b]);
  }
  return out;
}

/** colour along a three-stop ramp primary → secondary → accent */
export function ramp(p: { primary: string; secondary: string; accent: string }, t: number): string {
  const u = Math.max(0, Math.min(1, t));
  return u < 0.5 ? mix(p.primary, p.secondary, u * 2) : mix(p.secondary, p.accent, (u - 0.5) * 2);
}

export const voronoi: FacadeType = {
  id: 'voronoi',
  num: 1,
  name: 'Voronoi shell',
  description: 'A rainscreen of cushioned Voronoi panels on a slender joint frame. Every window and door gets its own seed, so each opening sits inside one large organic cell, and the panels around it grow or shrink with a parametric field. Calm at a distance, cellular up close.',
  params: [
    def({ key: 'cell', label: 'Cell size', unit: 'mm', min: 1200, max: 4000, step: 100, default: 2200 }),
    def({ key: 'field', label: 'Cell field', unit: '', kind: 'select', default: 'rising', options: [
      { value: 'uniform', label: 'Even' }, { value: 'rising', label: 'Finer with height' }, { value: 'openings', label: 'Finer round windows' }] }),
    def({ key: 'joint', label: 'Joint frame', unit: 'mm', min: 30, max: 200, step: 5, default: 50 }),
    def({ key: 'bulge', label: 'Panel cushion', unit: 'mm', min: 0, max: 400, step: 10, default: 140 }),
    def({ key: 'offset', label: 'Stand-off', unit: 'mm', min: 100, max: 600, step: 10, default: 220 }),
    def({ key: 'voids', label: 'Open cells', unit: '%', min: 0, max: 40, step: 1, default: 0 }),
  ],
  palettes: [
    { name: 'White solid surface', primary: '#f2f1ec', secondary: '#e2e1dc', accent: '#2a2d30' },
    { name: 'Champagne aluminium', primary: '#d8ccb6', secondary: '#c7b99f', accent: '#3b362f' },
    { name: 'Graphite', primary: '#62676c', secondary: '#565b60', accent: '#d4d6d8' },
  ],
  generate(face, openings, levels, orient, params, palette) {
    const c = new Ctx(voronoi, face, openings, levels, orient, params, palette);
    const S = c.m('cell');
    const field = c.str('field');
    const g = c.m('joint');
    const bulge = c.m('bulge') * c.clim(0.8, 1.25);
    const off = c.m('offset');
    const voids = c.pct('voids');
    const rnd = rng(17 + Math.round(face.width * 31));
    const opens = [...c.openRects(0.06), ...c.doorRects(0.08)];

    const cells = voronoiCells(c, S, field, rnd);
    const frame = cells;
    const panels = cells.map((poly) => {
      const bb = { x0: Math.min(...poly.map((q) => q[0])), x1: Math.max(...poly.map((q) => q[0])), y0: Math.min(...poly.map((q) => q[1])), y1: Math.max(...poly.map((q) => q[1])) };
      return { poly, open: opens.some((o) => overlap(o, bb) > 0) || rnd() < voids };
    });

    // cushioned panels: a shallow pyramid fanned from the centroid
    let nPanels = 0, panelArea = 0;
    for (const { poly, open } of panels) {
      if (open) continue;
      const ip = inset(poly, g / 2 + 0.01);
      if (!ip) continue;
      const a = area(ip);
      const [cu, cz] = centroid(ip);
      const rise = bulge * Math.min(1, Math.sqrt(a) / S);
      const tone = shade(rnd() < 0.5 ? palette.primary : palette.secondary, (rnd() - 0.5) * 0.06);
      if (rise < 0.01) c.add({ kind: 'facet', role: 'solid', fill: tone, pts: ip.map(([u, z]) => [u, z, off] as [number, number, number]) });
      else for (let k = 0; k < ip.length; k++) {
        const p = ip[k], q = ip[(k + 1) % ip.length];
        c.add({ kind: 'facet', role: 'solid', soft: true, fill: tone, pts: [[p[0], p[1], off], [q[0], q[1], off], [cu, cz, off + rise]] });
      }
      if (rise >= 0.01) c.add({ kind: 'line', role: 'screen', porosity: 1, fill: '#1b1a17', width: 0.012, pts: [...ip, ip[0]].map(([u, z]) => [u, z, off] as [number, number, number]) });
      nPanels++;
      panelArea += a;
    }

    // joint frame: each Voronoi edge once, stopping wherever it would cross an opening
    const seen = new Set<string>();
    const keyOf = (p: P2) => `${Math.round(p[0] * 200)},${Math.round(p[1] * 200)}`;
    let members = 0, len = 0;
    for (const poly of frame) {
      for (let k = 0; k < poly.length; k++) {
        const a = poly[k], b = poly[(k + 1) % poly.length];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L < 0.05) continue;
        const ka = keyOf(a), kb = keyOf(b), key = ka < kb ? ka + kb : kb + ka;
        if (seen.has(key)) continue;
        seen.add(key);
        const bar: Prim = { kind: 'bar', role: 'solid', fill: palette.accent, a, b, w: g, d0: off - 0.06, d1: off + 0.03 };
        if (opens.some((r) => barHitsRect(bar as Extract<Prim, { kind: 'bar' }>, r))) continue;
        c.add(bar);
        members++;
        len += L;
      }
    }

    c.row('Voronoi panel, cushioned', `≈ ${Math.round(S * 1000)} cell, rise ≤ ${Math.round(bulge * 1000)}`, palette.name, nPanels, 0);
    c.row('Panel area', '12 mm solid surface / 3 mm Al', palette.name, 1, panelArea, 'm²');
    c.row('Joint frame', sz(g, 0.09), 'Aluminium extrusion', len, 0, 'm');
    c.notes.push(`${cells.length} cells (${panels.filter((p) => p.open).length} open around ${c.openings.length} openings), ${members} frame members.`);
    return c.finish();
  },
};
