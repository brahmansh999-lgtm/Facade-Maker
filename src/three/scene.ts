// House massing for the axonometric: walls with openings cut, slabs, plinth, parapet, stair head,
// glazing, plus each face's facade group. Flat tones + edges, no lights.
import * as THREE from 'three';
import type { Derived } from '../model/derive.ts';
import { EXT_WALL, MUMTY_HEIGHT, PARAPET, SLAB } from '../model/units.ts';
import { subtract, type Rect } from '../geometry/rect.ts';
import { SIDES } from '../geometry/faces.ts';
import { GeoBuilder } from './primMeshes.ts';

const TONE = { wall: '#e6e1d5', slab: '#cdc7ba', plinth: '#b9b2a3', ground: '#ebe7de', glass: '#9cc3cf', frame: '#3b3f42', door: '#a88866', mumty: '#ddd8cc', furn: '#d9d1c1', soft: '#c9bfae', wet: '#e9edec' };
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

const FURN_TONE: Partial<Record<string, string>> = { sofa: TONE.soft, armchair: TONE.soft, bed: '#ece6da', shower: TONE.wet, wc: '#f4f4f2', basin: '#f4f4f2', rug: '#d6cdbb', plant: '#a9b49a' };

export function buildHouse(d: Derived): THREE.Group {
  const gb = new GeoBuilder();
  const p = d.project;
  const o = d.outer;
  const roofZ = d.faces.front.face.roofZ;
  // ground: the site
  const s = p.site;
  gb.quad(new THREE.Vector3(0, -0.01, 0), new THREE.Vector3(s.width, -0.01, 0), new THREE.Vector3(s.width, -0.01, -s.depth), new THREE.Vector3(0, -0.01, -s.depth), TONE.ground);
  for (const [a, b] of [[[0, 0], [s.width, 0]], [[s.width, 0], [s.width, s.depth]], [[s.width, s.depth], [0, s.depth]], [[0, s.depth], [0, 0]]]) {
    gb.edge(new THREE.Vector3(a[0], 0, -a[1]), new THREE.Vector3(b[0], 0, -b[1]));
  }
  // plinth
  pbox(gb, o.x0, o.y0, o.x1, o.y1, 0, p.brief.plinth, TONE.plinth);
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
    // slab over this level
    pbox(gb, o.x0, o.y0, o.x1, o.y1, z1, z1 + SLAB, TONE.slab);
  });
  // outline edges of the wall mass (walls were drawn without per-piece edges)
  const corners: [number, number][] = [[o.x0, o.y0], [o.x1, o.y0], [o.x1, o.y1], [o.x0, o.y1]];
  for (const [x, y] of corners) gb.edge(new THREE.Vector3(x, p.brief.plinth, -y), new THREE.Vector3(x, roofZ, -y));
  // parapet
  const T = EXT_WALL;
  pbox(gb, o.x0, o.y0, o.x1, o.y0 + T, roofZ, roofZ + PARAPET, TONE.wall);
  pbox(gb, o.x0, o.y1 - T, o.x1, o.y1, roofZ, roofZ + PARAPET, TONE.wall);
  pbox(gb, o.x0, o.y0 + T, o.x0 + T, o.y1 - T, roofZ, roofZ + PARAPET, TONE.wall);
  pbox(gb, o.x1 - T, o.y0 + T, o.x1, o.y1 - T, roofZ, roofZ + PARAPET, TONE.wall);
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
