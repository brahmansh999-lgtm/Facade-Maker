// House massing for the axonometric: walls with openings cut, slabs, plinth, parapet, stair head,
// glazing, plus each face's facade group. Flat tones + edges, no lights.
import * as THREE from 'three';
import type { Derived } from '../model/derive.ts';
import { EXT_WALL, MUMTY_HEIGHT, PARAPET, SLAB } from '../model/units.ts';
import { subtract, type Rect } from '../geometry/rect.ts';
import { SIDES } from '../geometry/faces.ts';
import { GeoBuilder } from './primMeshes.ts';
import { Region, loopEdges, shapes } from '../geometry/region.ts';
import type { Vec2 } from '../model/types.ts';

const TONE = { wall: '#e6e1d5', slab: '#cdc7ba', plinth: '#b9b2a3', ground: '#ebe7de', glass: '#9cc3cf', frame: '#3b3f42', door: '#a88866', mumty: '#ddd8cc', column: '#d4cfc4', lawn: '#c9d4b0', pave: '#dedad0', bed: '#aab68f', bwall: '#e2dccf', leaf: '#8fa474', trunk: '#7a6a58', deck: '#d9c9a8', canopy: '#ece9e1', lid: '#f1efe9', furn: '#d9d1c1', soft: '#c9bfae', wet: '#e9edec' };
const GLASS_OPACITY = 0.28;

/** plan rect + height range → world box (X = x, Y = z, Z = −y) */
function pbox(gb: GeoBuilder, x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, hex: string, edges = true, opacity = 1) {
  gb.box(new THREE.Vector3(Math.min(x0, x1), z0, -Math.max(y0, y1)), new THREE.Vector3(Math.max(x0, x1), z1, -Math.min(y0, y1)), hex, opacity, edges);
}

/** a glazed opening: slim frame on four sides and a see-through pane (plan along s, wall at c) */
function glazing(gb: GeoBuilder, run: 'x' | 'y', c: number, a: number, b: number, z0: number, z1: number) {
  const f = 0.05, t = 0.035;
  const put = (s0: number, s1: number, za: number, zb: number, hex: string, edges: boolean, op = 1) => {
    if (run === 'x') pbox(gb, s0, c - t, s1, c + t, za, zb, hex, edges, op);
    else pbox(gb, c - t, s0, c + t, s1, za, zb, hex, edges, op);
  };
  put(a, a + f, z0, z1, TONE.frame, true);
  put(b - f, b, z0, z1, TONE.frame, true);
  put(a + f, b - f, z0, z0 + f, TONE.frame, true);
  put(a + f, b - f, z1 - f, z1, TONE.frame, true);
  const n = Math.max(1, Math.ceil((b - a) / 0.9 - 1e-6));
  for (let i = 1; i < n; i++) { const m = a + ((b - a) * i) / n; put(m - f / 2, m + f / 2, z0 + f, z1 - f, TONE.frame, true); }
  put(a + f, b - f, z0 + f, z1 - f, TONE.glass, false, GLASS_OPACITY);
}

const V = (pt: Vec2, z: number) => new THREE.Vector3(pt[0], z, -pt[1]);

/** a flat slab of any rectilinear outline, holes allowed */
function prism(gb: GeoBuilder, rg: Region, z0: number, z1: number, hex: string, edges = true) {
  for (const { outer, holes } of shapes(rg.loops())) {
    const v2 = (l: Vec2[]) => l.map(([x, y]) => new THREE.Vector2(x, y));
    const tris = THREE.ShapeUtils.triangulateShape(v2(outer), holes.map(v2));
    const all = [...outer, ...holes.flat()];
    for (const [a, b, c] of tris) {
      gb.tri(V(all[a], z1), V(all[b], z1), V(all[c], z1), hex, 1, V(all[a], z1 - 1));
      gb.tri(V(all[a], z0), V(all[b], z0), V(all[c], z0), hex, 1, V(all[a], z0 + 1));
    }
    for (const lp of [outer, ...holes]) for (const e of loopEdges(lp)) {
      const ref = V([(e.a[0] + e.b[0]) / 2 - e.n[0] * 0.05, (e.a[1] + e.b[1]) / 2 - e.n[1] * 0.05], (z0 + z1) / 2);
      gb.quad(V(e.a, z0), V(e.b, z0), V(e.b, z1), V(e.a, z1), hex, 1, ref);
      if (edges) { gb.edge(V(e.a, z0), V(e.b, z0)); gb.edge(V(e.a, z1), V(e.b, z1)); gb.edge(V(e.a, z0), V(e.a, z1)); }
    }
  }
}

/** plan rect of a strip of thickness t laid inside an outline edge */
const stripIn = (e: { a: Vec2; b: Vec2; n: Vec2 }, t: number, off = 0): [number, number, number, number] => {
  const ax = e.a[0] - e.n[0] * off, ay = e.a[1] - e.n[1] * off, bx = e.b[0] - e.n[0] * (off + t), by = e.b[1] - e.n[1] * (off + t);
  return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)];
};

/** glass balustrade on the open edges of a roof deck, 1.0 m above it */
function balustrades(gb: GeoBuilder, deck: Region, upper: Region, z: number) {
  const h = 1.0;
  for (const lp of deck.loops()) for (const e of loopEdges(lp)) {
    const mx = (e.a[0] + e.b[0]) / 2 + e.n[0] * 0.05, my = (e.a[1] + e.b[1]) / 2 + e.n[1] * 0.05;
    if (upper.contains(mx, my)) continue;
    const [x0, y0, x1, y1] = stripIn(e, 0.03, 0.04);
    pbox(gb, x0, y0, x1, y1, z, z + h - 0.05, TONE.glass, false, 0.3);
    pbox(gb, x0 - 0.01, y0 - 0.01, x1 + 0.01, y1 + 0.01, z + h - 0.05, z + h, TONE.frame, true);
  }
}

/** garden, paving, planting, boundary wall and gates, trees, and the rear verandah */
function siteWorks3D(gb: GeoBuilder, d: Derived) {
  const w = d.works;
  const flat = (rg: Region, z: number, hex: string) => {
    for (const r of rg.rects()) gb.quad(V([r.x0, r.y0], z), V([r.x1, r.y0], z), V([r.x1, r.y1], z), V([r.x0, r.y1], z), hex, 1, V([r.x0, r.y0], z - 1));
    for (const lp of rg.loops()) for (const e of loopEdges(lp)) gb.edge(V(e.a, z), V(e.b, z));
  };
  flat(w.lawn, 0.004, TONE.lawn);
  flat(w.paving, 0.008, TONE.pave);
  for (const b of w.beds) pbox(gb, b.x0, b.y0, b.x1, b.y1, 0, 0.3, TONE.bed);
  for (const { r, h } of w.walls) {
    pbox(gb, r.x0, r.y0, r.x1, r.y1, 0, h, TONE.bwall);
    pbox(gb, r.x0 - 0.03, r.y0 - 0.03, r.x1 + 0.03, r.y1 + 0.03, h, h + 0.06, TONE.slab);
  }
  for (const g of w.gates) pbox(gb, g.x0, g.y0 + 0.08, g.x1, g.y1 - 0.08, 0.05, g.kind === 'car' ? 1.5 : 1.4, TONE.frame, true, 0.55);
  for (const t of w.trees) {
    pbox(gb, t.x - 0.1, t.y - 0.1, t.x + 0.1, t.y + 0.1, 0, 1.9, TONE.trunk, false);
    const tier = (r: number, z0: number, h: number) => {
      const prof = Array.from({ length: 8 }, (_, k) => V([t.x + Math.cos((k / 8) * Math.PI * 2) * r, t.y - Math.sin((k / 8) * Math.PI * 2) * r], z0));
      gb.extrude(prof, new THREE.Vector3(0, h, 0), TONE.leaf);
    };
    tier(t.r, 1.8, 1.3);
    tier(t.r * 0.68, 3.1, 0.9);
  }
  const vr = w.verandah;
  if (vr) {
    const top = d.project.brief.plinth - 0.03;
    prism(gb, Region.of([vr.deck]), 0, top, TONE.deck);
    for (let i = 0; i < vr.nSteps; i++) pbox(gb, vr.steps.x0, vr.steps.y0, vr.steps.x1, vr.steps.y0 + (i + 1) * 0.3, 0, top - ((i + 1) * top) / (vr.nSteps + 1), TONE.plinth);
    for (const c of vr.cols) pbox(gb, c.x - c.s / 2, c.y - c.s / 2, c.x + c.s / 2, c.y + c.s / 2, top, vr.zc0, TONE.frame);
    pbox(gb, vr.canopy.x0, vr.canopy.y0, vr.canopy.x1, vr.canopy.y1, vr.zc0, vr.zc1, TONE.canopy);
  }
}

const FURN_TONE: Partial<Record<string, string>> = { sofa: TONE.soft, armchair: TONE.soft, bed: '#ece6da', shower: TONE.wet, wc: '#f4f4f2', basin: '#f4f4f2', rug: '#d6cdbb', plant: '#a9b49a' };

export function buildHouse(d: Derived): THREE.Group {
  const gb = new GeoBuilder();
  const p = d.project;
  const roofZ = d.faces.front.face.roofZ;
  // ground: the site
  const s = p.site;
  gb.quad(new THREE.Vector3(0, -0.01, 0), new THREE.Vector3(s.width, -0.01, 0), new THREE.Vector3(s.width, -0.01, -s.depth), new THREE.Vector3(0, -0.01, -s.depth), TONE.ground);
  for (const [a, b] of [[[0, 0], [s.width, 0]], [[s.width, 0], [s.width, s.depth]], [[s.width, s.depth], [0, s.depth]], [[0, s.depth], [0, 0]]]) {
    gb.edge(new THREE.Vector3(a[0], 0, -a[1]), new THREE.Vector3(b[0], 0, -b[1]));
  }
  siteWorks3D(gb, d);
  const rg = d.regions;
  const n = d.levels.length;
  // plinth under the ground floor only: a cantilever hovers over open ground
  prism(gb, rg[0], 0, p.brief.plinth, TONE.plinth);
  // columns carrying a long cantilever
  for (const c of d.columns) pbox(gb, c.x - c.s / 2, c.y - c.s / 2, c.x + c.s / 2, c.y + c.s / 2, 0, c.z1, TONE.column);
  // walls per level, openings cut out
  d.levels.forEach((L, i) => {
    const z0 = L.level.elevation;
    const z1 = (d.levels[i + 1]?.level.elevation ?? roofZ) - SLAB;
    for (const w of L.walls) {
      const t = w.thickness;
      const ops = L.openings.filter((op) => op.wallId === w.id);
      const holes: Rect[] = ops.map((op) => ({ x0: op.center - op.width / 2, x1: op.center + op.width / 2, y0: z0 + op.sill, y1: z0 + op.head }));
      for (const r of subtract({ x0: w.s0 - EXT_WALL / 2, x1: w.s1 + EXT_WALL / 2, y0: z0, y1: z1 }, holes)) {
        if (w.run === 'x') pbox(gb, r.x0, w.c - t / 2, r.x1, w.c + t / 2, r.y0, r.y1, TONE.wall, false);
        else pbox(gb, w.c - t / 2, r.x0, w.c + t / 2, r.x1, r.y0, r.y1, TONE.wall, false);
      }
      if (!w.external) continue;
      for (const op of ops) {
        const a = op.center - op.width / 2, b = op.center + op.width / 2;
        if (op.kind === 'entrance') {
          if (w.run === 'x') pbox(gb, a, w.c - 0.02, b, w.c + 0.02, z0 + op.sill, z0 + op.head, TONE.door);
          else pbox(gb, w.c - 0.02, a, w.c + 0.02, b, z0 + op.sill, z0 + op.head, TONE.door);
        } else if (op.kind !== 'opening') glazing(gb, w.run, w.c, a, b, z0 + op.sill, z0 + op.head);
      }
    }
    // furniture as simple blocks, seen through the glass
    for (const f of L.furniture) {
      const r = f.r;
      const h = f.kind === 'chair' ? 0.45 : f.h;
      pbox(gb, r.x0 + 0.01, r.y0 + 0.01, r.x1 - 0.01, r.y1 - 0.01, z0, z0 + Math.max(0.01, h), FURN_TONE[f.kind] ?? TONE.furn, f.kind !== 'rug');
    }
    // slab over this level: covers this level and the one above (a cantilever floor, a terrace deck)
    prism(gb, rg[i].union(rg[i + 1] ?? rg[i]), z1, z1 + SLAB, TONE.slab);
    // outline edges of this storey's wall mass (walls were drawn without per-piece edges)
    for (const lp of rg[i].loops()) for (const pt of lp) gb.edge(V(pt, z0), V(pt, z1));
  });
  // parapet round the top storey
  const T = EXT_WALL;
  const top = rg[n - 1];
  for (const lp of top.loops()) for (const e of loopEdges(lp)) {
    const [x0, y0, x1, y1] = stripIn(e, T);
    pbox(gb, x0, y0, x1, y1, roofZ, roofZ + PARAPET, TONE.wall);
  }
  // glass balustrade round any roof terrace a stepped-back storey leaves on the one below
  for (let i = 1; i < n; i++) balustrades(gb, rg[i - 1].minus(rg[i]), rg[i], d.levels[i].level.elevation);
  // floating roof lid: a thin brim on a shadow gap over the parapet, following the top outline
  const lid = p.massing?.lid ?? 0;
  if (lid > 0) {
    const zt = roofZ + PARAPET + 0.12, zb = zt + 0.22;
    prism(gb, top.inflate(lid).minus(top.erode(0.6)), zt, zb, TONE.lid);
    // hidden posts set back in the shadow gap at the outer corners
    for (const lp of top.loops()) lp.forEach((pt, k) => {
      const a = lp[(k - 1 + lp.length) % lp.length], b = lp[(k + 1) % lp.length];
      const turn = (pt[0] - a[0]) * (b[1] - pt[1]) - (pt[1] - a[1]) * (b[0] - pt[0]);
      if (turn <= 0) return;
      const ix = Math.sign(a[0] - pt[0] + b[0] - pt[0]), iy = Math.sign(a[1] - pt[1] + b[1] - pt[1]);
      const x = pt[0] + ix * 0.3, y = pt[1] + iy * 0.3;
      pbox(gb, x - 0.05, y - 0.05, x + 0.05, y + 0.05, roofZ + PARAPET, zt, TONE.frame, false);
    });
  }
  // stair head-room
  const sp = p.stair.position;
  pbox(gb, sp.x - T / 2, sp.y - T / 2, sp.x + sp.w + T / 2, sp.y + sp.h + T / 2, roofZ, roofZ + MUMTY_HEIGHT, TONE.mumty);
  pbox(gb, sp.x - T / 2 - 0.08, sp.y - T / 2 - 0.08, sp.x + sp.w + T / 2 + 0.08, sp.y + sp.h + T / 2 + 0.08, roofZ + MUMTY_HEIGHT, roofZ + MUMTY_HEIGHT + SLAB, TONE.slab);
  const g = gb.build();
  g.name = 'house';
  return g;
}

export function sceneBounds(d: Derived) {
  const s = d.project.site;
  const o = { x0: Math.min(d.outer.x0, 0), y0: Math.min(d.outer.y0, 0), x1: Math.max(d.outer.x1, s.width), y1: Math.max(d.outer.y1, s.depth) };
  const top = d.faces.front.face.parapetTop + MUMTY_HEIGHT;
  const c = new THREE.Vector3((o.x0 + o.x1) / 2, top / 2.4, -(o.y0 + o.y1) / 2);
  const r = Math.hypot(o.x1 - o.x0, o.y1 - o.y0, top) / 2;
  return { c, r };
}

export function facadeGroups(d: Derived): THREE.Object3D[] {
  return SIDES.map((s) => d.faces[s].out.meshes3D());
}
