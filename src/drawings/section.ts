// Section A–A through the stair, along its run: cut slabs, beams, walls and stair in poché;
// the far flight and far-wall openings in projection; facade layers cut at the end walls.
import type { Derived } from '../model/derive.ts';
import { EXT_WALL, MUMTY_HEIGHT, PARAPET, SLAB, levelText } from '../model/units.ts';
import { subtract1D, roomRect } from '../geometry/rect.ts';
import { SIDES, gridLines, toPlan, toU } from '../geometry/faces.ts';
import { boxAsPrism, ccw, primBox } from './primDraw.ts';
import { View, W, type Painter } from './painter.ts';
import { GLASS, INK, PAPER, mix, shade } from './color.ts';
import { AREA, fitScale } from './sheet.ts';
import { TXT, bubble, chainDim, earthHatch, levelMark } from './annot.ts';
import { POCHE } from './plan.ts';

const BEAM = 0.45;

export function sectionGeom(d: Derived) {
  const st = d.stair;
  const axisY = st.axis === 'y';
  const A = (x: number, y: number) => (axisY ? y : x);
  const C = (x: number, y: number) => (axisY ? x : y);
  const f0 = st.flights[0];
  const cp = st.toPlan(0, (f0.t0 + f0.t1) / 2);
  const cut = C(cp[0], cp[1]);
  // looking toward the outer flight; keep the drawing un-mirrored for that viewer
  const viewSign = st.innerAtMin ? 1 : -1;
  const vd: [number, number] = axisY ? [viewSign, 0] : [0, viewSign];
  const right: [number, number] = [vd[1], -vd[0]];
  const sign = axisY ? right[1] : right[0];
  const H = (along: number) => sign * along;
  // the verandah (and its steps) extends the cut past the rear wall
  const vr = d.works.verandah;
  const o = vr ? { x0: d.outer.x0, y0: d.outer.y0, x1: Math.max(d.outer.x1, vr.canopy.x1), y1: Math.max(d.outer.y1, vr.steps.y1) } : d.outer;
  return { st, axisY, A, C, cut, cp, H, sign, a0: A(o.x0, o.y0), a1: A(o.x1, o.y1), sOrigin: A(st.rect.x0, st.rect.y0) };
}

export function sectionLayout(d: Derived) {
  const g = sectionGeom(d);
  const top = d.faces.front.face.parapetTop + 0 + MUMTY_HEIGHT;
  const wM = g.a1 - g.a0 + 7.5, hM = top + 4.5;
  const scale = fitScale(wM, hM);
  const k = 1000 / scale;
  const hm = (g.H(g.a0) + g.H(g.a1)) / 2;
  const cx = (AREA.x0 + AREA.x1) / 2 - 6, cy = (AREA.y0 + AREA.y1) / 2;
  return { view: new View(cx - hm * k, cy + (top / 2 - 0.6) * k, k), scale };
}

export function drawSection(pt: Painter, d: Derived, v: View) {
  const p = d.project;
  const g = sectionGeom(d);
  const { st, A, C, cut, H } = g;
  const X = (along: number) => v.X(H(along));
  const Y = v.Y;
  const poche = { fill: POCHE, stroke: POCHE, sw: W.PROJ };
  const R = (a0: number, z0: number, a1: number, z1: number, s: Parameters<Painter['rect']>[4]) => {
    const x0 = Math.min(X(a0), X(a1)), x1 = Math.max(X(a0), X(a1));
    pt.rect(x0, Y(Math.max(z0, z1)), x1 - x0, Math.abs(z1 - z0) * v.k, s);
  };
  // extent of each storey along the cut (massing steps show up here)
  const spans = d.regions.map((rg): [number, number] => {
    const hit = rg.rects().filter((r) => C(r.x0, r.y0) < cut && C(r.x1, r.y1) > cut);
    const rs = hit.length ? hit : rg.rects();
    return [Math.min(...rs.map((r) => A(r.x0, r.y0))), Math.max(...rs.map((r) => A(r.x1, r.y1)))];
  });
  const [lo, hi] = spans[0];
  const [tlo, thi] = spans[spans.length - 1];
  const levels = d.levels.map((L) => L.level);
  const roofZ = d.faces.front.face.roofZ;
  const ffls = [...levels.map((l) => l.elevation), roofZ];
  const s0 = g.sOrigin;
  const hole: [number, number] = [s0 + st.holeS[0], s0 + st.holeS[1]];

  // ground, plinth fill, footings
  const gLo = Math.min(lo, g.a0, g.a1), gHi = Math.max(hi, g.a0, g.a1);
  const xl = Math.min(X(gLo - 2.5), X(gHi + 2.5)), xr = Math.max(X(gLo - 2.5), X(gHi + 2.5));
  pt.line(xl, Y(0), xr, Y(0), { stroke: INK, sw: W.CUT * 1.2 });
  earthHatch(pt, xl, xr, Y(0), 1.4);
  R(lo, 0, hi, ffls[0] - 0.1, { fill: mix(PAPER, '#c9c2b2', 0.5), stroke: INK, sw: W.BEYOND });
  for (let a = lo + 0.3; a < hi - 0.2; a += 0.45) pt.line(X(a), Y(0.05), X(a + 0.25), Y(ffls[0] - 0.15), { stroke: shade(PAPER, 0.35), sw: W.THIN });
  for (const e of [lo, hi - EXT_WALL]) {
    R(e, -0.6, e + EXT_WALL, ffls[0], poche);
    R(e + EXT_WALL / 2 - 0.6, -1.5, e + EXT_WALL / 2 + 0.6, -0.6, { stroke: INK, sw: W.BEYOND, dash: [1.4, 0.9] });
  }
  R(lo, ffls[0] - 0.1, hi, ffls[0], poche);

  // slabs with stair opening, beams on grid lines
  const gl = gridLines(p);
  const gridAlong = (g.axisY ? gl.ys : gl.xs).map((q) => q.v);
  for (let i = 1; i < ffls.length; i++) {
    const z = ffls[i];
    const sa = Math.min(spans[i - 1][0], (spans[i] ?? spans[i - 1])[0]), sb = Math.max(spans[i - 1][1], (spans[i] ?? spans[i - 1])[1]);
    for (const [a, b] of subtract1D(sa, sb, [hole])) R(a, z - SLAB, b, z, poche);
    for (const ga of gridAlong) {
      if (ga > hole[0] + 0.05 && ga < hole[1] - 0.05) continue;
      R(ga - EXT_WALL / 2, z - BEAM, ga + EXT_WALL / 2, z - SLAB, poche);
    }
  }

  // walls crossing the cut
  const crossRun = g.axisY ? 'x' : 'y';
  d.levels.forEach((L, i) => {
    const z0 = L.level.elevation, z1 = ffls[i + 1] - SLAB;
    for (const w of L.walls) {
      if (w.run !== crossRun || cut < w.s0 - 1e-3 || cut > w.s1 + 1e-3) continue;
      const a = w.c - w.thickness / 2, b = w.c + w.thickness / 2;
      const op = L.openings.find((o) => o.wallId === w.id && Math.abs(o.center - cut) <= o.width / 2);
      if (!op) { R(a, z0, b, z1, poche); continue; }
      if (op.sill > 0.01) R(a, z0, b, z0 + op.sill, poche);
      R(a, z0 + op.head, b, z1, poche);
      if (op.kind === 'window' || op.kind === 'ventilator') {
        R(w.c - 0.02, z0 + op.sill, w.c + 0.02, z0 + op.head, { fill: GLASS, stroke: INK, sw: W.BEYOND });
        const outDir = w.neg === null ? -1 : 1;
        R(w.c + outDir * (w.thickness / 2), z0 + op.sill - 0.04, w.c + outDir * (w.thickness / 2 + 0.05), z0 + op.sill, { fill: shade(PAPER, 0.15), stroke: INK, sw: W.BEYOND });
      }
    }
  });
  // parapets at the cut external walls
  for (const e of [tlo, thi - EXT_WALL]) {
    R(e, roofZ, e + EXT_WALL, roofZ + PARAPET, poche);
    R(e - 0.03, roofZ + PARAPET, e + EXT_WALL + 0.03, roofZ + PARAPET + 0.075, { fill: shade(PAPER, 0.2), stroke: INK, sw: W.PROJ });
  }
  // terrace balustrades where a storey steps back from the one below
  for (let i = 1; i < spans.length; i++) {
    const z = ffls[i];
    for (const [edge, inner] of [[spans[i - 1][0], spans[i][0]], [spans[i - 1][1], spans[i][1]]] as const) {
      if (Math.abs(edge - inner) < 0.3 || (edge < inner) !== (edge === spans[i - 1][0])) continue;
      R(edge - 0.015, z, edge + 0.015, z + 1.0, { fill: GLASS, stroke: INK, sw: W.BEYOND });
      R(edge - 0.03, z + 0.95, edge + 0.03, z + 1.0, poche);
    }
  }
  // rear verandah: deck and canopy cut where the section crosses them, columns beyond
  const vr = d.works.verandah;
  if (vr && C(vr.deck.x0, vr.deck.y0) < cut && C(vr.deck.x1, vr.deck.y1) > cut) {
    const top = p.brief.plinth - 0.03;
    const span = (r: { x0: number; y0: number; x1: number; y1: number }): [number, number] => [A(r.x0, r.y0), A(r.x1, r.y1)];
    const [da, db] = span(vr.deck), [ca, cb] = span(vr.canopy);
    R(da, 0, db, top - 0.1, { fill: mix(PAPER, '#c9c2b2', 0.5), stroke: INK, sw: W.BEYOND });
    R(da, top - 0.1, db, top, poche);
    R(ca, vr.zc0, cb, vr.zc1, poche);
    for (const c of vr.cols) {
      const a = A(c.x, c.y);
      R(a - c.s / 2, top, a + c.s / 2, vr.zc0, { stroke: INK, sw: W.BEYOND });
    }
    if (C(vr.steps.x0, vr.steps.y0) < cut && C(vr.steps.x1, vr.steps.y1) > cut) {
      for (let i = 0; i < vr.nSteps; i++) {
        const a = A(vr.steps.x0, vr.steps.y0 + i * 0.3), b = A(vr.steps.x0, vr.steps.y0 + (i + 1) * 0.3);
        R(a, 0, b, top - ((i + 1) * top) / (vr.nSteps + 1), poche);
      }
    }
    pt.text(X((da + db) / 2), Y(top + 1.2), 'VERANDAH', { size: TXT.small, anchor: 'middle', spacing: 0.2 });
  }

  // floating roof lid on its shadow gap
  const lid = p.massing?.lid ?? 0;
  if (lid > 0) {
    const zt = roofZ + PARAPET + 0.12;
    R(tlo - lid, zt, thi + lid, zt + 0.22, poche);
    for (const e of [tlo + 0.3, thi - 0.3]) R(e - 0.05, roofZ + PARAPET + 0.075, e + 0.05, zt, poche);
  }
  // stair head-room on the roof
  const sa = s0, sb = s0 + st.long;
  R(sa - EXT_WALL / 2, roofZ, sa + EXT_WALL / 2, roofZ + MUMTY_HEIGHT, poche);
  R(sb - EXT_WALL / 2, roofZ, sb + EXT_WALL / 2, roofZ + MUMTY_HEIGHT, poche);
  R(sa - EXT_WALL / 2 - 0.05, roofZ + MUMTY_HEIGHT, sb + EXT_WALL / 2 + 0.05, roofZ + MUMTY_HEIGHT + SLAB, poche);
  R(sa - 0.2, roofZ + MUMTY_HEIGHT + SLAB, sb + 0.2, roofZ + MUMTY_HEIGHT + SLAB + 0.3, { stroke: INK, sw: W.BEYOND });

  // stairs per level
  const waistV = 0.15 / Math.cos(st.pitch);
  levels.forEach((lvl) => {
    const z = lvl.elevation;
    st.flights.forEach((f, fi) => {
      const pts: [number, number][] = [];
      const sA = s0 + f.sStart;
      const zA = z + f.zStart;
      pts.push([sA, zA]);
      for (let r = 1; r <= f.risers; r++) {
        const sr = sA + f.dir * (r - 1) * st.T;
        pts.push([sr, zA + r * st.R]);
        if (r < f.risers) pts.push([sr + f.dir * st.T, zA + r * st.R]);
      }
      const sEnd = sA + f.dir * (f.risers - 1) * st.T;
      const zEnd = zA + f.risers * st.R;
      // soffit runs parallel to the root line (through the inner step corners), one waist below
      const soffit = (s: number) => zA + ((s - sA) * f.dir * st.R) / st.T - waistV;
      const sFoot = sA + (f.dir * waistV * st.T) / st.R;
      const poly = [...pts, [sEnd, soffit(sEnd)] as [number, number], [sFoot, zA] as [number, number]];
      const flat = poly.flatMap(([a, zz]) => [X(a), Y(zz)]);
      if (fi === 0) {
        pt.poly(flat, true, poche);
        // handrail
        pt.line(X(sA), Y(zA + st.R + 0.9), X(sEnd), Y(zEnd + 0.9), { stroke: INK, sw: W.BEYOND });
        pt.line(X(sA), Y(zA + st.R + 0.9), X(sA), Y(zA + st.R), { stroke: INK, sw: W.BEYOND });
      } else {
        pt.poly(flat, true, { fill: shade(PAPER, 0.08), stroke: INK, sw: W.PROJ });
      }
    });
    for (const l of st.landings) {
      if (st.type === 'straight') continue;
      R(s0 + l.s0, z + l.z - SLAB, s0 + l.s1, z + l.z, poche);
    }
  });

  // far wall openings (beyond) and the far wall line
  const parRun = g.axisY ? 'y' : 'x';
  d.levels.forEach((L) => {
    for (const w of L.walls) {
      if (!w.external || w.run !== parRun) continue;
      const toward = (w.c - cut) * (st.innerAtMin ? 1 : -1) > 0;
      if (!toward) continue;
      for (const op of L.openings.filter((o) => o.wallId === w.id)) {
        R(op.center - op.width / 2, L.level.elevation + op.sill, op.center + op.width / 2, L.level.elevation + op.head, { fill: mix(GLASS, PAPER, 0.5), stroke: INK, sw: W.BEYOND });
      }
    }
  });

  // facade layers cut at the end walls
  for (const side of SIDES) {
    const fd = d.faces[side];
    const f = fd.face;
    const parallel = g.axisY ? side === 'left' || side === 'right' : side === 'front' || side === 'rear';
    if (parallel) continue;
    const uc = toU(f, g.cp[0], g.cp[1]);
    const toA = (dd: number) => { const q = toPlan(f, uc, dd); return A(q[0], q[1]); };
    for (const p0 of fd.out.prims) {
      const bb = primBox(p0);
      if (uc < bb.u0 || uc > bb.u1 || p0.kind === 'line' || p0.kind === 'disc') continue;
      const style = { fill: mix(p0.fill, PAPER, 0.15), stroke: INK, sw: W.BEYOND };
      if (p0.kind === 'prismU') {
        pt.poly(p0.pts.flatMap(([zz, dd]) => [X(toA(dd)), Y(zz)]), true, style);
      } else if (p0.kind === 'prismZ' || (p0.kind === 'box' && p0.rot)) {
        const poly = ccw(p0.kind === 'prismZ' ? p0.pts : boxAsPrism(p0).pts);
        const ds: number[] = [];
        for (let i = 0; i < poly.length; i++) {
          const [u1, d1] = poly[i], [u2, d2] = poly[(i + 1) % poly.length];
          if ((u1 - uc) * (u2 - uc) <= 0 && u1 !== u2) ds.push(d1 + ((uc - u1) / (u2 - u1)) * (d2 - d1));
        }
        ds.sort((a, b) => a - b);
        for (let i = 0; i + 1 < ds.length; i += 2) R(toA(ds[i]), bb.z0, toA(ds[i + 1]), bb.z1, style);
      } else {
        R(toA(bb.d0), bb.z0, toA(Math.max(bb.d1, bb.d0 + 0.005)), bb.z1, style);
      }
    }
  }

  // room names in the cut
  pt.begin('labels');
  d.levels.forEach((L) => {
    for (const r of L.level.rooms) {
      const b = roomRect(r);
      const c0 = C(b.x0, b.y0), c1 = C(b.x1, b.y1);
      if (cut < c0 || cut > c1 || r.type === 'stair') continue;
      const am = (A(b.x0, b.y0) + A(b.x1, b.y1)) / 2;
      const wmm = Math.abs(A(b.x1, b.y1) - A(b.x0, b.y0)) * v.k;
      if (wmm < 8) continue;
      pt.text(X(am), Y(L.level.elevation + 1.3), r.name, { size: Math.min(TXT.label, wmm / (r.name.length * 0.65)), anchor: 'middle', weight: 600, spacing: 0.12 });
    }
  });
  pt.end();

  // dims, levels, grid
  const left = Math.min(X(lo), X(hi)), rightX = Math.max(X(lo), X(hi));
  const top = roofZ + MUMTY_HEIGHT + SLAB;
  const zs = [...new Set([0, ...ffls, roofZ + PARAPET, top].map((z) => Math.round(z * 1000)))].sort((a, b) => a - b).map((z) => z / 1000);
  chainDim(pt, 'v', zs.map(Y), zs, left - 14, left);
  ffls.forEach((z, i) => levelMark(pt, rightX + 20, Y(z), levelText(z), 'right', i < levels.length ? (i === 0 ? 'FFL GROUND' : `FFL LEVEL ${i}`) : 'TOS ROOF'));
  levelMark(pt, rightX + 20, Y(0), '±0.000', 'right', 'NGL');
  levelMark(pt, rightX + 20, Y(top), levelText(top), 'right', 'STAIR HEAD');
  const ga = [...gridAlong].sort((a, b) => X(a) - X(b));
  chainDim(pt, 'h', ga.map(X), ga.map((a) => a * g.sign), Y(-2.1), Y(0));
  (g.axisY ? gl.ys : gl.xs).forEach((q) => {
    pt.line(X(q.v), Y(-2.6), X(q.v), Y(top + 0.6), { stroke: INK, sw: W.THIN, dash: [4, 0.8, 0.6, 0.8] });
    bubble(pt, X(q.v), Y(top + 1.1), q.label);
  });
  // stair note
  const note = `${st.type.toUpperCase()} STAIR · ${st.n} R @ ${Math.round(st.R * 1000)} · ${st.n - (st.type === 'dogleg' ? 2 : 1)} T @ ${Math.round(st.T * 1000)} · 2R+T ${Math.round(st.twoRT * 1000)} · HEADROOM ${st.headroom.toFixed(2)} m`;
  pt.text(left, Y(-3.4), note, { size: 1.8, font: 'mono' });
}
