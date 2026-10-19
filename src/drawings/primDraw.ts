import type { Face, Prim, PrismZPrim } from '../facades/types.ts';
import { SvgPainter, W, type Painter } from './painter.ts';
import { INK, facetTone, shade } from './color.ts';

/** a rotated box is just a 4-point prism */
export function boxAsPrism(p: Extract<Prim, { kind: 'box' }>): PrismZPrim {
  const uc = p.u + p.w / 2, dc = (p.d0 + p.d1) / 2;
  const hw = p.w / 2, hd = (p.d1 - p.d0) / 2;
  const t = ((p.rot ?? 0) * Math.PI) / 180;
  const c = Math.cos(t), s = Math.sin(t);
  const pts: [number, number][] = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, y]) => [uc + x * c - y * s, dc + x * s + y * c]);
  return { kind: 'prismZ', role: p.role, porosity: p.porosity, fill: p.fill, opacity: p.opacity, z0: p.z, z1: p.z + p.h, pts };
}

/** CCW-normalised profile (x right, y = d out of the wall) */
export function ccw(pts: [number, number][]): [number, number][] {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return a >= 0 ? pts : [...pts].reverse();
}

export function primBox(p: Prim): { u0: number; u1: number; z0: number; z1: number; d0: number; d1: number } {
  switch (p.kind) {
    case 'box': {
      if (!p.rot) return { u0: p.u, u1: p.u + p.w, z0: p.z, z1: p.z + p.h, d0: p.d0, d1: p.d1 };
      return primBox(boxAsPrism(p));
    }
    case 'prismZ': {
      const us = p.pts.map((q) => q[0]), ds = p.pts.map((q) => q[1]);
      return { u0: Math.min(...us), u1: Math.max(...us), z0: p.z0, z1: p.z1, d0: Math.min(...ds), d1: Math.max(...ds) };
    }
    case 'prismU': {
      const zs = p.pts.map((q) => q[0]), ds = p.pts.map((q) => q[1]);
      return { u0: p.u0, u1: p.u1, z0: Math.min(...zs), z1: Math.max(...zs), d0: Math.min(...ds), d1: Math.max(...ds) };
    }
    case 'disc': return { u0: p.u - p.r, u1: p.u + p.r, z0: p.z - p.r, z1: p.z + p.r, d0: p.d, d1: p.d };
    case 'line': {
      const us = p.pts.map((q) => q[0]), zs = p.pts.map((q) => q[1]), ds = p.pts.map((q) => q[2]);
      return { u0: Math.min(...us), u1: Math.max(...us), z0: Math.min(...zs), z1: Math.max(...zs), d0: Math.min(...ds), d1: Math.max(...ds) };
    }
    case 'perf': case 'mesh': return { u0: p.u, u1: p.u + p.w, z0: p.z, z1: p.z + p.h, d0: p.d0, d1: p.d1 };
  }
}

export interface ElevMap { X: (u: number) => number; Y: (z: number) => number; k: number }

/**
 * Draw facade primitives as seen on the elevation (looking at the face from outside).
 * Facets read through flat tonal fills; edges at the 'beyond' weight.
 */
export function drawPrims(pt: Painter, prims: Prim[], m: ElevMap, opts: { line?: number; detail?: number } = {}) {
  const sw = opts.line ?? W.BEYOND;
  const fine = Math.min(sw, 0.09);
  const order = prims.map((p, i) => ({ p, i, d: primBox(p).d1 })).sort((a, b) => a.d - b.d || a.i - b.i);
  for (const { p } of order) {
    switch (p.kind) {
      case 'box': {
        if (p.rot) { drawPrismZ(pt, boxAsPrism(p), m, sw); break; }
        const x = m.X(p.u), y = m.Y(p.z + p.h);
        pt.rect(x, y, p.w * m.k, p.h * m.k, { fill: p.fill, stroke: INK, sw: p.w * m.k < 1 || p.h * m.k < 1 ? fine : sw, opacity: p.opacity });
        break;
      }
      case 'prismZ': drawPrismZ(pt, p, m, sw); break;
      case 'prismU': {
        const pts = ccw(p.pts);
        const facets: { a: number; b: number; nd: number; nz: number; dm: number }[] = [];
        for (let i = 0; i < pts.length; i++) {
          const [z1, d1] = pts[i], [z2, d2] = pts[(i + 1) % pts.length];
          const nz = d2 - d1, nd = -(z2 - z1);
          if (nd > 1e-6) facets.push({ a: Math.min(z1, z2), b: Math.max(z1, z2), nd, nz, dm: (d1 + d2) / 2 });
        }
        facets.sort((a, b) => a.dm - b.dm);
        for (const fc of facets) {
          pt.rect(m.X(p.u0), m.Y(fc.b), (p.u1 - p.u0) * m.k, (fc.b - fc.a) * m.k, { fill: facetTone(p.fill, 0, fc.nz, fc.nd), opacity: p.opacity });
        }
        const bb = primBox(p);
        pt.rect(m.X(bb.u0), m.Y(bb.z1), (bb.u1 - bb.u0) * m.k, (bb.z1 - bb.z0) * m.k, { stroke: INK, sw });
        break;
      }
      case 'disc':
        pt.circle(m.X(p.u), m.Y(p.z), p.r * m.k, { fill: p.fill, stroke: shade(p.fill, 0.45), sw: fine, opacity: p.opacity });
        break;
      case 'line': {
        const pts: number[] = [];
        for (const q of p.pts) pts.push(m.X(q[0]), m.Y(q[1]));
        pt.poly(pts, false, { stroke: p.fill, sw: Math.max(fine, p.width * m.k) });
        break;
      }
      case 'perf': {
        const x = m.X(p.u), y = m.Y(p.z + p.h);
        pt.rect(x, y, p.w * m.k, p.h * m.k, { fill: p.fill });
        const hole = shade(p.fill, 0.62);
        if ((opts.detail ?? 1) > 0) for (const [u, z, r] of p.holes) pt.circle(m.X(u), m.Y(z), r * m.k, { fill: hole });
        pt.rect(x, y, p.w * m.k, p.h * m.k, { stroke: INK, sw });
        break;
      }
      case 'mesh': {
        const x = m.X(p.u), y = m.Y(p.z + p.h);
        pt.rect(x, y, p.w * m.k, p.h * m.k, { fill: p.fill, opacity: p.opacity ?? 0.35 });
        const step = Math.max(p.pitch, 0.06);
        const col = shade(p.fill, 0.35);
        for (let z = p.z + step; z < p.z + p.h - 1e-6; z += step) pt.line(x, m.Y(z), x + p.w * m.k, m.Y(z), { stroke: col, sw: fine * 0.7 });
        for (let u = p.u + step * 2; u < p.u + p.w - 1e-6; u += step * 2) pt.line(m.X(u), y, m.X(u), y + p.h * m.k, { stroke: col, sw: fine * 0.7 });
        pt.rect(x, y, p.w * m.k, p.h * m.k, { stroke: INK, sw });
        break;
      }
    }
  }
}

function drawPrismZ(pt: Painter, p: PrismZPrim, m: ElevMap, sw: number) {
  const pts = ccw(p.pts);
  const facets: { a: number; b: number; nu: number; nd: number; dm: number }[] = [];
  for (let i = 0; i < pts.length; i++) {
    const [u1, d1] = pts[i], [u2, d2] = pts[(i + 1) % pts.length];
    const nu = d2 - d1, nd = -(u2 - u1);
    if (nd > 1e-6) facets.push({ a: Math.min(u1, u2), b: Math.max(u1, u2), nu, nd, dm: (d1 + d2) / 2 });
  }
  facets.sort((a, b) => a.dm - b.dm);
  const y = m.Y(p.z1), h = (p.z1 - p.z0) * m.k;
  for (const fc of facets) pt.rect(m.X(fc.a), y, (fc.b - fc.a) * m.k, h, { fill: facetTone(p.fill, fc.nu, 0, fc.nd), opacity: p.opacity });
  const bb = primBox(p);
  if (facets.length > 2) {
    for (const fc of facets.slice(0, -1)) {
      const x = m.X(fc.b);
      pt.line(x, y, x, y + h, { stroke: shade(p.fill, 0.5), sw: Math.min(sw, 0.07) });
    }
  }
  pt.rect(m.X(bb.u0), y, (bb.u1 - bb.u0) * m.k, h, { stroke: INK, sw });
}

/** standalone SVG of a facade layer at 1:100 on mm units */
export function primsToSVG(prims: Prim[], face: Face): string {
  const k = 10;
  const w = face.width * k, h = face.parapetTop * k;
  const pt = new SvgPainter();
  drawPrims(pt, prims, { X: (u) => u * k, Y: (z) => h - z * k, k });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(2)} ${h.toFixed(2)}" width="${w.toFixed(2)}mm" height="${h.toFixed(2)}mm">${pt}</svg>`;
}
