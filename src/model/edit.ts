// Pure editing operations on the project (plan editor). Each returns a new Project.
import type { OpeningOverride, Project, Room, RoomType } from './types.ts';
import { r3, snap } from './units.ts';
import { area, overlap, polyOf, roomRect, union, type Rect } from '../geometry/rect.ts';
import { footprint, gridLines } from '../geometry/faces.ts';

export type Edge = 'x0' | 'x1' | 'y0' | 'y1';
const MIN_ROOM = 0.9;

export const ROOM_LABEL: Record<RoomType, string> = {
  living: 'LIVING', dining: 'DINING', kitchen: 'KITCHEN', bedroom: 'BEDROOM', bath: 'BATH', wc: 'WC', study: 'STUDY',
  utility: 'UTILITY', stair: 'STAIR', corridor: 'PASSAGE', family: 'FAMILY', void: 'VOID — DOUBLE HT.', foyer: 'FOYER', store: 'STORE', shaft: 'DUCT',
};

const clone = (p: Project): Project => structuredClone(p);

/** snap a model coordinate to the 150 module from the grid origin, or to a grid line within 0.2 m */
export function snapCoord(p: Project, axis: 'x' | 'y', v: number): number {
  const g = gridLines(p);
  const lines = (axis === 'x' ? g.xs : g.ys).map((l) => l.v);
  const near = lines.find((l) => Math.abs(l - v) < 0.2);
  if (near !== undefined) return near;
  const o = axis === 'x' ? p.grid.origin[0] : p.grid.origin[1];
  return r3(o + snap(v - o));
}

/** every room edge on a level connected to the seed through overlapping ranges along one wall line */
function edgeChain(rooms: Room[], axis: 'x' | 'y', c: number, seed: { r0: number; r1: number }[]) {
  const hits: { room: Room; edge: Edge }[] = [];
  const ranges = [...seed];
  const used = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const room of rooms) {
      const b = roomRect(room);
      for (const edge of (axis === 'x' ? ['x0', 'x1'] : ['y0', 'y1']) as Edge[]) {
        const key = room.id + edge;
        if (used.has(key) || Math.abs(b[edge] - c) > 1e-4) continue;
        const r0 = axis === 'x' ? b.y0 : b.x0, r1 = axis === 'x' ? b.y1 : b.x1;
        if (!ranges.some((q) => Math.min(q.r1, r1) - Math.max(q.r0, r0) > 1e-4)) continue;
        used.add(key);
        hits.push({ room, edge });
        ranges.push({ r0, r1 });
        grew = true;
      }
    }
  }
  return hits;
}

export function moveEdge(p0: Project, li: number, roomId: string, edge: Edge, target: number): Project {
  const p = clone(p0);
  const lvl = p.levels[li];
  const room = lvl.rooms.find((r) => r.id === roomId);
  if (!room) return p0;
  const b = roomRect(room);
  const axis: 'x' | 'y' = edge[0] as 'x' | 'y';
  const c = b[edge];
  const fp = footprint(p);
  const external = Math.abs(c - (axis === 'x' ? fp.x0 : fp.y0)) < 1e-4 || Math.abs(c - (axis === 'x' ? fp.x1 : fp.y1)) < 1e-4;
  const seed = axis === 'x' ? { r0: b.y0, r1: b.y1 } : { r0: b.x0, r1: b.x1 };
  let chains = [{ li, hits: edgeChain(lvl.rooms, axis, c, [seed]) }];
  const touchesStair = chains[0].hits.some((h) => h.room.type === 'stair');
  if (external) {
    // the outline is structural: it moves on every level together with the grid
    chains = p.levels.map((L, i) => ({ li: i, hits: edgeChain(L.rooms, axis, c, [{ r0: -1e9, r1: 1e9 }]) }));
  } else if (touchesStair) {
    const sp = p.stair.position;
    const sr: Rect = { x0: sp.x, y0: sp.y, x1: sp.x + sp.w, y1: sp.y + sp.h };
    const sseed = axis === 'x' ? { r0: sr.y0, r1: sr.y1 } : { r0: sr.x0, r1: sr.x1 };
    chains = p.levels.map((L, i) => ({ li: i, hits: edgeChain(L.rooms, axis, c, [sseed]) }));
  }
  // clamp so no room collapses below the minimum
  let lo = -Infinity, hi = Infinity;
  for (const ch of chains) for (const h of ch.hits) {
    const rb = roomRect(h.room);
    if (h.edge === 'x1') lo = Math.max(lo, rb.x0 + MIN_ROOM);
    if (h.edge === 'x0') hi = Math.min(hi, rb.x1 - MIN_ROOM);
    if (h.edge === 'y1') lo = Math.max(lo, rb.y0 + MIN_ROOM);
    if (h.edge === 'y0') hi = Math.min(hi, rb.y1 - MIN_ROOM);
  }
  const v = Math.min(hi, Math.max(lo, target));
  if (Math.abs(v - c) < 1e-6) return p0;
  for (const ch of chains) for (const h of ch.hits) {
    const rb = roomRect(h.room);
    rb[h.edge] = r3(v);
    h.room.polygon = polyOf(rb);
  }
  // keep the stair authority in step
  const stairRoom = p.levels[li].rooms.find((r) => r.type === 'stair');
  if (stairRoom) {
    const sb = roomRect(stairRoom);
    p.stair.position = { x: sb.x0, y: sb.y0, w: r3(sb.x1 - sb.x0), h: r3(sb.y1 - sb.y0) };
  }
  if (external) {
    const g = p.grid;
    if (axis === 'x') {
      if (Math.abs(c - fp.x0) < 1e-4) { g.xBays[0] = r3(g.xBays[0] + (c - v)); g.origin = [r3(v), g.origin[1]]; }
      else g.xBays[g.xBays.length - 1] = r3(g.xBays[g.xBays.length - 1] + (v - c));
    } else {
      if (Math.abs(c - fp.y0) < 1e-4) { g.yBays[0] = r3(g.yBays[0] + (c - v)); g.origin = [g.origin[0], r3(v)]; }
      else g.yBays[g.yBays.length - 1] = r3(g.yBays[g.yBays.length - 1] + (v - c));
    }
  }
  return p;
}

export function splitRoom(p0: Project, li: number, roomId: string): Project {
  const p = clone(p0);
  const lvl = p.levels[li];
  const room = lvl.rooms.find((r) => r.id === roomId);
  if (!room || room.type === 'stair') return p0;
  const b = roomRect(room);
  const vertical = b.x1 - b.x0 >= b.y1 - b.y0;
  const mid = vertical ? snapCoord(p, 'x', (b.x0 + b.x1) / 2) : snapCoord(p, 'y', (b.y0 + b.y1) / 2);
  const a: Rect = vertical ? { ...b, x1: mid } : { ...b, y1: mid };
  const c: Rect = vertical ? { ...b, x0: mid } : { ...b, y0: mid };
  if (Math.min(a.x1 - a.x0, a.y1 - a.y0, c.x1 - c.x0, c.y1 - c.y0) < MIN_ROOM) return p0;
  room.polygon = polyOf(a);
  let n = 2;
  while (lvl.rooms.some((r) => r.id === `${roomId}-s${n}`)) n++;
  lvl.rooms.push({ id: `${roomId}-s${n}`, type: room.type, name: `${room.name} ${String.fromCharCode(64 + n)}`, polygon: polyOf(c) });
  return p;
}

export function canMerge(p: Project, li: number, ids: string[]): boolean {
  if (ids.length !== 2) return false;
  const rs = ids.map((id) => p.levels[li].rooms.find((r) => r.id === id)).filter(Boolean) as Room[];
  if (rs.length !== 2 || rs.some((r) => r.type === 'stair')) return false;
  const a = roomRect(rs[0]), b = roomRect(rs[1]);
  const u = union([a, b]);
  return overlap(a, b) === 0 && Math.abs(area(u) - area(a) - area(b)) < 1e-4;
}

export function mergeRooms(p0: Project, li: number, ids: string[]): Project {
  if (!canMerge(p0, li, ids)) return p0;
  const p = clone(p0);
  const lvl = p.levels[li];
  const [a, b] = ids.map((id) => lvl.rooms.find((r) => r.id === id)!);
  a.polygon = polyOf(union([roomRect(a), roomRect(b)]));
  lvl.rooms = lvl.rooms.filter((r) => r.id !== b.id);
  return p;
}

export function setRoom(p0: Project, li: number, roomId: string, patch: Partial<Pick<Room, 'type' | 'name'>>): Project {
  const p = clone(p0);
  const r = p.levels[li].rooms.find((x) => x.id === roomId);
  if (!r || r.type === 'stair' || patch.type === 'stair') return p0;
  if (patch.type && patch.type !== r.type && (!patch.name || patch.name === r.name)) {
    // relabel when the name was just the old type's label
    if (r.name.startsWith(ROOM_LABEL[r.type].split(' ')[0])) r.name = ROOM_LABEL[patch.type];
  }
  Object.assign(r, patch);
  return p;
}

/** move the stair by swapping its enclosure with a room of the same footprint on every level */
export function swapStair(p0: Project, li: number, roomId: string): { project: Project; error?: string } {
  const target = p0.levels[li].rooms.find((r) => r.id === roomId);
  if (!target || target.type === 'stair') return { project: p0, error: 'Pick a room to swap the stair into.' };
  const tr = roomRect(target);
  const sp = p0.stair.position;
  const sr: Rect = { x0: sp.x, y0: sp.y, x1: sp.x + sp.w, y1: sp.y + sp.h };
  const same = (a: Rect, b: Rect) => Math.abs(a.x0 - b.x0) + Math.abs(a.x1 - b.x1) + Math.abs(a.y0 - b.y0) + Math.abs(a.y1 - b.y1) < 1e-3;
  const p = clone(p0);
  for (const L of p.levels) {
    const t = L.rooms.find((r) => r.type !== 'stair' && same(roomRect(r), tr));
    if (!t) return { project: p0, error: `Level ${L.index} has no room matching that footprint — stair must stack.` };
    const s = L.rooms.find((r) => r.type === 'stair');
    if (s) s.polygon = polyOf(tr);
    t.polygon = polyOf(sr);
  }
  p.stair.position = { x: tr.x0, y: tr.y0, w: r3(tr.x1 - tr.x0), h: r3(tr.y1 - tr.y0) };
  return { project: p };
}

export function setOverride(p0: Project, id: string, patch: OpeningOverride | null): Project {
  const p = clone(p0);
  if (patch === null) delete p.openingOverrides[id];
  else p.openingOverrides[id] = { ...p.openingOverrides[id], ...patch };
  return p;
}
