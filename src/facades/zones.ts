// Facades on stepped massing: every zone of a face is generated as its own planar sub-face, then
// shifted back into the parent face's frame (u along, d set back by the zone's inset).
import type { Face, FaceZone } from '../geometry/faces.ts';
import type { FacadeOutput, FacadeType, Orientation, Palette, Prim, ScheduleRow } from './types.ts';
import type { ParamSet } from '../model/types.ts';
import { buildPrimGroup } from '../three/primMeshes.ts';
import { primBox, primsToSVG } from '../drawings/primDraw.ts';

/** true when the face is one plain plane and needs no zoning */
export const isPlanar = (f: Face) => f.zones.length <= 1 && (f.zones[0]?.inset ?? 0) < 1e-6 && (f.zones[0]?.u0 ?? 0) < 1e-6 && Math.abs((f.zones[0]?.u1 ?? f.width) - f.width) < 1e-6;

export function zoneFace(face: Face, z: FaceZone): Face {
  const width = z.u1 - z.u0;
  const O: [number, number] = [face.O[0] + z.u0 * face.U[0] - z.inset * face.N[0], face.O[1] + z.u0 * face.U[1] - z.inset * face.N[1]];
  const levels = face.levels.filter((l) => z.levels.includes(l.index));
  return {
    ...face,
    width, O,
    groundZ: z.levels.includes(0) ? face.groundZ : z.z0,
    plinthTop: z.z0,
    levels,
    roofZ: z.roof ? face.roofZ : z.z1,
    parapetTop: z.z1,
    gridU: face.gridU.map((g) => ({ ...g, u: g.u - z.u0 })).filter((g) => g.u > 0.05 && g.u < width - 0.05),
    openings: face.openings.filter((o) => z.levels.includes(o.levelIndex)).map((o) => ({ ...o, u0: o.u0 - z.u0, u1: o.u1 - z.u0, inset: 0 })),
    mumty: z.roof && face.mumty ? { ...face.mumty, u0: face.mumty.u0 - z.u0, u1: face.mumty.u1 - z.u0, dist: face.mumty.dist - z.inset } : null,
    zones: [{ ...z, u0: 0, u1: width, inset: 0 }],
  };
}

export function shiftPrim(p: Prim, du: number, dd: number): Prim {
  switch (p.kind) {
    case 'box': case 'perf': case 'mesh': {
      const q = { ...p, u: p.u + du, d0: p.d0 + dd, d1: p.d1 + dd };
      if (q.kind === 'perf') q.holes = q.holes.map(([u, z, r]) => [u + du, z, r]);
      return q;
    }
    case 'prismZ': return { ...p, pts: p.pts.map(([u, d]) => [u + du, d + dd]) };
    case 'prismU': return { ...p, u0: p.u0 + du, u1: p.u1 + du, pts: p.pts.map(([z, d]) => [z, d + dd]) };
    case 'disc': return { ...p, u: p.u + du, d: p.d + dd };
    case 'line': case 'facet': return { ...p, pts: p.pts.map(([u, z, d]) => [u + du, z, d + dd]) };
    case 'bar': return { ...p, a: [p.a[0] + du, p.a[1]], b: [p.b[0] + du, p.b[1]], d0: p.d0 + dd, d1: p.d1 + dd };
    case 'sweep': return { ...p, pts: p.pts.map(([u, z, d]) => [u + du, z, d + dd]), d0: p.d0 + dd };
  }
}

/** zero-height leftovers from bands a zone does not have */
const degenerate = (p: Prim) => {
  if (p.kind === 'line') return false;
  const b = primBox(p);
  return b.z1 - b.z0 < 0.005 || b.u1 - b.u0 < 0.002;
};

export function runZoned(type: FacadeType, face: Face, orient: Orientation, params: ParamSet, palette: Palette): FacadeOutput {
  const prims: Prim[] = [];
  const rows = new Map<string, ScheduleRow>();
  const notes: string[] = [];
  for (const z of face.zones) {
    const sub = zoneFace(face, z);
    if (sub.width < 0.3 || z.z1 - z.z0 < 0.3) continue;
    const out = type.generate(sub, sub.openings, sub.levels, orient, params, palette);
    for (const p of out.prims) if (!degenerate(p)) prims.push(shiftPrim(p, z.u0, -z.inset));   // the zone's wall sits inset behind the face plane
    for (const r of out.schedule) {
      const k = `${r.element}|${r.size}|${r.material}|${r.unit}`;
      const e = rows.get(k);
      if (e) { e.count += r.count; e.area += r.area; } else rows.set(k, { ...r });
    }
    notes.push(...out.notes);
  }
  const schedule = [...rows.values()].map((r) => ({ ...r, area: Math.round(r.area * 100) / 100, count: Math.round(r.count * 100) / 100 }));
  let g: ReturnType<typeof buildPrimGroup> | null = null;
  return {
    prims, schedule, notes: face.zones.length > 1 ? [`${face.zones.length} massing zones. ${notes.join(' ')}`] : notes,
    meshes3D: () => (g ??= buildPrimGroup(prims, face)),
    elevationSVG: () => primsToSVG(prims, face),
  };
}
