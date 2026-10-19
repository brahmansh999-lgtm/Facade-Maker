// Facade primitives → merged three.js geometry. MeshBasicMaterial only: form is read through
// flat tones baked per facet from its world normal, plus explicit edge line segments.
import * as THREE from 'three';
import type { Face, Prim } from '../facades/types.ts';
import { boxAsPrism, ccw } from '../drawings/primDraw.ts';
import { hexToRgb, INK } from '../drawings/color.ts';

const LIGHT = new THREE.Vector3(-0.55, 0.85, 0.62).normalize();

export function toneRGB(hex: string, n: THREE.Vector3): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  const d = n.dot(LIGHT);
  const k = d >= 0 ? 0.78 + 0.26 * d : 0.78 + 0.2 * d;
  return [Math.min(1, (r / 255) * k), Math.min(1, (g / 255) * k), Math.min(1, (b / 255) * k)];
}

/** accumulates triangles (with per-vertex colours) and edge segments in world space */
export class GeoBuilder {
  pos: number[] = [];
  col: number[] = [];
  edges: number[] = [];
  tpos = new Map<number, { pos: number[]; col: number[] }>();

  /** ref: a point inside the solid, used to orient the facet normal outward for its tone */
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, hex: string, opacity = 1, ref?: THREE.Vector3) {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    if (ref) {
      const mid = new THREE.Vector3().add(a).add(b).add(c).multiplyScalar(1 / 3);
      if (n.dot(mid.sub(ref)) < 0) n.negate();
    }
    const [r, g, bl] = toneRGB(hex, n);
    let P = this.pos, C = this.col;
    if (opacity < 0.999) {
      const key = Math.round(opacity * 10) / 10;
      if (!this.tpos.has(key)) this.tpos.set(key, { pos: [], col: [] });
      const t = this.tpos.get(key)!;
      P = t.pos; C = t.col;
    }
    P.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    C.push(r, g, bl, r, g, bl, r, g, bl);
  }
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, hex: string, opacity = 1, ref?: THREE.Vector3) {
    this.tri(a, b, c, hex, opacity, ref);
    this.tri(a, c, d, hex, opacity, ref);
  }
  edge(a: THREE.Vector3, b: THREE.Vector3) { this.edges.push(a.x, a.y, a.z, b.x, b.y, b.z); }

  /** extrude a closed CCW profile given as 3D points along a direction */
  extrude(profile: THREE.Vector3[], dir: THREE.Vector3, hex: string, opacity = 1, edges = true) {
    const n = profile.length;
    const top = profile.map((p) => p.clone().add(dir));
    const ref = profile.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / n).add(dir.clone().multiplyScalar(0.5));
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      this.quad(profile[i], profile[j], top[j], top[i], hex, opacity, ref);
    }
    // caps
    const pts2 = this.planar(profile, dir);
    const tris = THREE.ShapeUtils.triangulateShape(pts2, []);
    for (const [a, b, c] of tris) {
      this.tri(profile[c], profile[b], profile[a], hex, opacity, ref);
      this.tri(top[a], top[b], top[c], hex, opacity, ref);
    }
    if (edges) {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        this.edge(profile[i], profile[j]);
        this.edge(top[i], top[j]);
        this.edge(profile[i], top[i]);
      }
    }
  }
  private planar(pts: THREE.Vector3[], dir: THREE.Vector3): THREE.Vector2[] {
    const nrm = dir.clone().normalize();
    const ax = Math.abs(nrm.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const e1 = ax.sub(nrm.clone().multiplyScalar(ax.dot(nrm))).normalize();
    const e2 = nrm.clone().cross(e1);
    return pts.map((p) => new THREE.Vector2(p.dot(e1), p.dot(e2)));
  }
  box(min: THREE.Vector3, max: THREE.Vector3, hex: string, opacity = 1, edges = true) {
    const p = [
      new THREE.Vector3(min.x, min.y, min.z), new THREE.Vector3(max.x, min.y, min.z),
      new THREE.Vector3(max.x, min.y, max.z), new THREE.Vector3(min.x, min.y, max.z),
    ];
    this.extrude(p, new THREE.Vector3(0, max.y - min.y, 0), hex, opacity, edges);
  }

  build(edgeColor = INK, edgeOpacity = 0.85): THREE.Group {
    const g = new THREE.Group();
    const mk = (pos: number[], col: number[], opacity: number) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const mat = new THREE.MeshBasicMaterial({
        vertexColors: true, side: THREE.DoubleSide, transparent: opacity < 1, opacity,
        depthWrite: opacity >= 1, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
      });
      const m = new THREE.Mesh(geo, mat);
      if (opacity < 1) m.renderOrder = 2;
      g.add(m);
    };
    if (this.pos.length) mk(this.pos, this.col, 1);
    for (const [o, t] of this.tpos) mk(t.pos, t.col, Math.max(0.1, o));
    if (this.edges.length) {
      const eg = new THREE.BufferGeometry();
      eg.setAttribute('position', new THREE.Float32BufferAttribute(this.edges, 3));
      g.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: edgeOpacity })));
    }
    return g;
  }
}

/** face-local (u, z, d) → world. World: X = plan x, Y = height, Z = −plan y. */
export function faceToWorld(face: Pick<Face, 'O' | 'U' | 'N'>) {
  return (u: number, z: number, d: number) =>
    new THREE.Vector3(face.O[0] + u * face.U[0] + d * face.N[0], z, -(face.O[1] + u * face.U[1] + d * face.N[1]));
}

export function addPrims(gb: GeoBuilder, prims: Prim[], face: Face) {
  const Wp = faceToWorld(face);
  for (const p0 of prims) {
    const p = p0.kind === 'box' ? boxAsPrism(p0) : p0;
    switch (p.kind) {
      case 'prismZ': {
        const prof = ccw(p.pts).map(([u, d]) => Wp(u, p.z0, d));
        gb.extrude(prof, new THREE.Vector3(0, p.z1 - p.z0, 0), p.fill, p.opacity ?? 1);
        break;
      }
      case 'prismU': {
        const prof = ccw(p.pts).map(([z, d]) => Wp(p.u0, z, d));
        const end = Wp(p.u1, 0, 0).sub(Wp(p.u0, 0, 0));
        gb.extrude(prof, end, p.fill, p.opacity ?? 1);
        break;
      }
      case 'disc': {
        const c = Wp(p.u, p.z, p.d);
        const seg = 8;
        const ring: THREE.Vector3[] = [];
        for (let i = 0; i < seg; i++) {
          const a = (i / seg) * Math.PI * 2;
          ring.push(Wp(p.u + Math.cos(a) * p.r, p.z + Math.sin(a) * p.r, p.d));
        }
        const ref = Wp(p.u, p.z, p.d - 1);
        for (let i = 0; i < seg; i++) gb.tri(c, ring[i], ring[(i + 1) % seg], p.fill, p.opacity ?? 1, ref);
        break;
      }
      case 'line': {
        for (let i = 0; i < p.pts.length - 1; i++) {
          const [a, b] = [p.pts[i], p.pts[i + 1]];
          gb.edge(Wp(a[0], a[1], a[2]), Wp(b[0], b[1], b[2]));
        }
        break;
      }
      case 'perf': case 'mesh': {
        const op = p.opacity ?? Math.max(0.25, 1 - (p.porosity ?? 0.5));
        const prof = [Wp(p.u, p.z, p.d0), Wp(p.u + p.w, p.z, p.d0), Wp(p.u + p.w, p.z, p.d1), Wp(p.u, p.z, p.d1)];
        gb.extrude(prof, new THREE.Vector3(0, p.h, 0), p.fill, op);
        break;
      }
    }
  }
}

export function buildPrimGroup(prims: Prim[], face: Face): THREE.Group {
  const gb = new GeoBuilder();
  addPrims(gb, prims, face);
  return gb.build();
}
