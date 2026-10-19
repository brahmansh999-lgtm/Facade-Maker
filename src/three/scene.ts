// House massing for the axonometric: walls with openings cut, slabs, plinth, parapet, stair head,
// glazing, plus each face's facade group. Flat tones + edges, no lights.
import * as THREE from 'three';
import type { Derived } from '../model/derive.ts';
import { EXT_WALL, MUMTY_HEIGHT, PARAPET, SLAB } from '../model/units.ts';
import { subtract, type Rect } from '../geometry/rect.ts';
import { SIDES } from '../geometry/faces.ts';
import { GeoBuilder } from './primMeshes.ts';
import { terraceStrips } from '../geometry/massing.ts';

const TONE = { wall: '#e6e1d5', slab: '#cdc7ba', plinth: '#b9b2a3', ground: '#ebe7de', glass: '#9cc3cf', frame: '#3b3f42', door: '#a88866', mumty: '#ddd8cc', lid: '#f1efe9', furn: '#d9d1c1', soft: '#c9bfae', wet: '#e9edec' };
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

/** glass balustrade along the open edges of a deck strip, 1.0 m above the deck */
function balustrade(gb: GeoBuilder, r: Rect & { open: 'y0' | 'y1' }, z: number) {
  const t = 0.03, h = 1.0;
  const edge: [number, number, number, number] = r.open === 'y1' ? [r.x0, r.y1 - t, r.x1, r.y1] : [r.x0, r.y0, r.x1, r.y0 + t];
  const runs: [number, number, number, number][] = [edge, [r.x0, r.y0, r.x0 + t, r.y1], [r.x1 - t, r.y0, r.x1, r.y1]];
  for (const [x0, y0, x1, y1] of runs) {
    pbox(gb, x0, y0, x1, y1, z, z + h - 0.05, TONE.glass, false, 0.3);
    pbox(gb, x0 - 0.01, y0 - 0.01, x1 + 0.01, y1 + 0.01, z + h - 0.05, z + h, TONE.frame, true);
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
  const ol = d.outlines;
  const n = d.levels.length;
  // plinth under the ground floor only: a cantilever hovers over open ground
  const g0 = ol[0];
  pbox(gb, g0.x0, g0.y0, g0.x1, g0.y1, 0, p.brief.plinth, TONE.plinth);
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
    const a = ol[i], b = ol[i + 1] ?? ol[i];
    pbox(gb, Math.min(a.x0, b.x0), Math.min(a.y0, b.y0), Math.max(a.x1, b.x1), Math.max(a.y1, b.y1), z1, z1 + SLAB, TONE.slab);
    // outline edges of this storey's wall mass (walls were drawn without per-piece edges)
    for (const [x, y] of [[a.x0, a.y0], [a.x1, a.y0], [a.x1, a.y1], [a.x0, a.y1]]) gb.edge(new THREE.Vector3(x, z0, -y), new THREE.Vector3(x, z1, -y));
  });
  // parapet on the top storey
  const T = EXT_WALL;
  const top = ol[n - 1];
  pbox(gb, top.x0, top.y0, top.x1, top.y0 + T, roofZ, roofZ + PARAPET, TONE.wall);
  pbox(gb, top.x0, top.y1 - T, top.x1, top.y1, roofZ, roofZ + PARAPET, TONE.wall);
  pbox(gb, top.x0, top.y0 + T, top.x0 + T, top.y1 - T, roofZ, roofZ + PARAPET, TONE.wall);
  pbox(gb, top.x1 - T, top.y0 + T, top.x1, top.y1 - T, roofZ, roofZ + PARAPET, TONE.wall);
  // glass balustrade round any roof terrace a stepped-back storey leaves on the one below
  for (let i = 1; i < n; i++) {
    const lo = ol[i - 1], up = ol[i], z = d.levels[i].level.elevation;
    for (const r of terraceStrips(lo, up)) balustrade(gb, r, z);
  }
  // floating roof lid: a thin brim on a shadow gap over the parapet
  const lid = p.massing?.lid ?? 0;
  if (lid > 0) {
    const zt = roofZ + PARAPET + 0.12, zb = zt + 0.22;
    const O = { x0: top.x0 - lid, y0: top.y0 - lid, x1: top.x1 + lid, y1: top.y1 + lid };
    const I = { x0: top.x0 + 0.6, y0: top.y0 + 0.6, x1: top.x1 - 0.6, y1: top.y1 - 0.6 };
    pbox(gb, O.x0, O.y0, O.x1, I.y0, zt, zb, TONE.lid);
    pbox(gb, O.x0, I.y1, O.x1, O.y1, zt, zb, TONE.lid);
    pbox(gb, O.x0, I.y0, I.x0, I.y1, zt, zb, TONE.lid);
    pbox(gb, I.x1, I.y0, O.x1, I.y1, zt, zb, TONE.lid);
    // hidden posts set back in the shadow gap
    for (const [x, y] of [[top.x0 + 0.3, top.y0 + 0.3], [top.x1 - 0.3, top.y0 + 0.3], [top.x1 - 0.3, top.y1 - 0.3], [top.x0 + 0.3, top.y1 - 0.3]]) pbox(gb, x - 0.05, y - 0.05, x + 0.05, y + 0.05, roofZ + PARAPET, zt, TONE.frame, false);
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
  const o = d.outer;
  const top = d.faces.front.face.parapetTop + MUMTY_HEIGHT;
  const c = new THREE.Vector3((o.x0 + o.x1) / 2, top / 2.4, -(o.y0 + o.y1) / 2);
  const r = Math.hypot(o.x1 - o.x0, o.y1 - o.y0, top) / 2;
  return { c, r };
}

export function facadeGroups(d: Derived): THREE.Object3D[] {
  return SIDES.map((s) => d.faces[s].out.meshes3D());
}
