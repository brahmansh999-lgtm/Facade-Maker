import type { FaceKey, Level, OpeningOverride, Room, RoomType, Side } from '../model/types.ts';
import { EXT_WALL, INT_WALL, clamp, r3, snapUp } from '../model/units.ts';
import { area, roomRect, type Rect } from './rect.ts';
import { insideRoom, wallLength, type Wall } from './walls.ts';

export type OpeningKind = 'window' | 'ventilator' | 'door' | 'entrance' | 'garden' | 'opening';

export interface Opening {
  id: string;
  tag: string;
  levelId: string;
  levelIndex: number;
  kind: OpeningKind;
  wallId: string;
  run: 'x' | 'y';
  c: number;
  center: number;
  width: number;
  /** sill and head above level FFL */
  sill: number;
  head: number;
  roomId: string;
  otherRoomId: string | null;
  external: boolean;
  side?: Side;
  glazedArea: number;
  ventArea: number;
  /** fraction of opening area a screen in front must keep open (≥ the required ventilation) */
  reqRatio: number;
  hinge: 'min' | 'max';
  swingInto: string | null;
  leaves: number;
  overridden: boolean;
}

export const HABITABLE: RoomType[] = ['living', 'dining', 'bedroom', 'study', 'family', 'kitchen'];
export const WET: RoomType[] = ['bath', 'wc', 'utility', 'kitchen'];

/** clear (carpet) rectangle: centreline rect less half wall thickness on each edge */
export function clearRect(room: Room, walls: Wall[]): Rect {
  const b = roomRect(room);
  const edgeT = (run: 'x' | 'y', c: number) => {
    const ws = walls.filter((w) => w.run === run && Math.abs(w.c - c) < 1e-4 && (w.neg === room.id || w.pos === room.id));
    return ws.some((w) => w.external) ? EXT_WALL : ws.length ? INT_WALL : 0;
  };
  return {
    x0: b.x0 + edgeT('y', b.x0) / 2, x1: b.x1 - edgeT('y', b.x1) / 2,
    y0: b.y0 + edgeT('x', b.y0) / 2, y1: b.y1 - edgeT('x', b.y1) / 2,
  };
}

const SILL: Partial<Record<RoomType, [number, number]>> = {
  living: [0.45, 2.4], dining: [0.45, 2.4], bedroom: [0.75, 2.4], study: [0.75, 2.4], family: [0.6, 2.4],
  kitchen: [1.05, 2.4], utility: [1.2, 2.4], stair: [0.9, 2.4], corridor: [0.9, 2.4], void: [0.3, 2.4],
};

/** relative daylight preference by compass face (northern hemisphere; mirrored south of the equator) */
export function orientFactor(key: FaceKey, latitude: number): number {
  const north = { N: 1.15, E: 1.0, S: 0.95, W: 0.85 }[key];
  if (latitude >= 0) return north;
  return { N: 0.95, E: 1.0, S: 1.15, W: 0.85 }[key];
}

const ACCESS: Partial<Record<RoomType, RoomType[]>> = {
  bedroom: ['corridor', 'family', 'foyer', 'living'],
  study: ['corridor', 'foyer', 'family', 'living'],
  family: ['corridor'],
  living: ['corridor', 'foyer'],
  dining: ['living', 'corridor'],
  kitchen: ['dining', 'corridor', 'utility'],
  foyer: ['corridor'],
  bath: ['corridor', 'bedroom', 'family'],
  wc: ['corridor', 'foyer', 'living'],
  utility: ['kitchen', 'corridor'],
  store: ['corridor', 'bedroom', 'kitchen', 'family', 'living', 'dining'],
  stair: ['corridor', 'foyer', 'living', 'family'],
  corridor: ['corridor'],
};
const DOOR_W: Partial<Record<RoomType, number>> = { bath: 0.75, wc: 0.75, store: 0.75, utility: 0.9, kitchen: 0.9, bedroom: 0.9, study: 0.9 };
const OPEN_PLAN: RoomType[] = ['living', 'dining', 'family', 'foyer', 'stair', 'corridor'];

export function deriveOpenings(
  level: Level, walls: Wall[], faceKeyFor: (s: Side) => FaceKey, latitude: number,
  overrides: Record<string, OpeningOverride>,
): Opening[] {
  const out: Opening[] = [];
  const rooms = new Map(level.rooms.map((r) => [r.id, r]));
  const base = (id: string, w: Wall, room: Room, other: Room | null, kind: OpeningKind, center: number, width: number, sill: number, head: number): Opening => ({
    id, tag: '', levelId: level.id, levelIndex: level.index, kind, wallId: w.id, run: w.run, c: w.c, center, width, sill, head,
    roomId: room.id, otherRoomId: other?.id ?? null, external: w.external, side: w.outside,
    glazedArea: 0, ventArea: 0, reqRatio: 0.2, hinge: 'min', swingInto: null, leaves: 1, overridden: false,
  });

  // ---- entrance host on the ground floor
  let entranceHost: string | null = null;
  if (level.index === 0) {
    for (const t of ['corridor', 'foyer', 'living'] as RoomType[]) {
      const host = level.rooms.find((r) => r.type === t && walls.some((w) => w.outside === 'front' && insideRoom(w) === r.id && wallLength(w) >= 1.2));
      if (host) { entranceHost = host.id; break; }
    }
  }

  for (const room of level.rooms) {
    const ext = walls.filter((w) => w.external && insideRoom(w) === room.id && wallLength(w) > 0.6);
    const clear = clearRect(room, walls);
    const A = area(clear);
    const [sill, head] = SILL[room.type] ?? [0.9, 2.4];
    const h = head - sill;

    if (HABITABLE.includes(room.type)) {
      const req = A / 10;
      const target = req * (room.type === 'living' ? 1.8 : 1.5);
      const ranked = ext
        .map((w) => ({ w, f: orientFactor(faceKeyFor(w.outside!), latitude), len: wallLength(w) }))
        .filter((x) => x.len - 0.9 >= 0.6)
        .sort((a, b) => b.f * Math.min(b.len, 4) - a.f * Math.min(a.len, 4));
      const shares = ranked.length >= 2 && A >= 12 ? [0.65, 0.35] : [1];
      // a cantilevered lounge bay is all view: picture glass across its end wall
      if (room.id.endsWith('-bay') && ranked.length) {
        const end = ext.find((w) => w.outside === 'front') ?? ranked[0].w;
        out.push(base(`${room.id}:win:${end.outside}`, end, room, null, 'window', (end.s0 + end.s1) / 2, r3(wallLength(end) - 0.6), 0.3, 2.4));
        ranked.splice(0, ranked.length, ...ranked.filter((x) => x.w !== end).slice(0, 1));
        shares.splice(0, shares.length, ...(ranked.length ? [0.4] : []));
      }
      let carry = 0;
      ranked.slice(0, shares.length).forEach((x, k) => {
        const want = Math.max(target * shares[k] * x.f, req * 1.3 * shares[k]) + carry;
        const maxW = x.len - 0.9;
        let width = clamp(snapUp(want / h), 0.9, maxW);
        if (width > maxW) width = maxW;
        carry = Math.max(0, want - width * h);
        const o = base(`${room.id}:win:${x.w.outside}`, x.w, room, null, 'window', (x.w.s0 + x.w.s1) / 2, r3(width), sill, head);
        out.push(o);
      });
    } else if (room.type === 'bath' || room.type === 'wc') {
      const w = ext.sort((a, b) => wallLength(b) - wallLength(a))[0];
      if (w) {
        const o = base(`${room.id}:vent:${w.outside}`, w, room, null, 'ventilator', (w.s0 + w.s1) / 2, 0.6, 1.95, 2.4);
        o.reqRatio = 0.3;
        out.push(o);
      }
    } else if (room.type === 'utility' || room.type === 'stair' || room.type === 'void') {
      const w = ext.sort((a, b) => wallLength(b) - wallLength(a))[0];
      if (w) {
        const width = room.type === 'utility' ? 0.9 : room.type === 'stair' ? Math.min(1.2, wallLength(w) - 0.9) : Math.min(2.4, wallLength(w) - 0.9);
        if (width >= 0.6) {
          const o = base(`${room.id}:win:${w.outside}`, w, room, null, 'window', (w.s0 + w.s1) / 2, r3(width), sill, head);
          o.reqRatio = room.type === 'utility' ? 0.3 : 0.2;
          out.push(o);
        }
      }
    } else if (room.type === 'corridor') {
      for (const w of ext) {
        const len = wallLength(w);
        const mid = (w.s0 + w.s1) / 2;
        if (room.id === entranceHost && w.outside === 'front') out.push(base(`${room.id}:entrance`, w, room, null, 'entrance', mid, Math.min(1.2, len - 0.3), 0, 2.4));
        else if (level.index === 0 && w.outside === 'rear' && len >= 1.1) out.push(base(`${room.id}:garden`, w, room, null, 'garden', mid, Math.min(1.0, len - 0.3), 0, 2.4));
        else if (len >= 1.0) out.push(base(`${room.id}:win:${w.outside}`, w, room, null, 'window', mid, Math.min(0.6, len - 0.4), sill, head));
      }
    }
    if (room.id === entranceHost && room.type !== 'corridor') {
      const w = ext.find((x) => x.outside === 'front');
      if (w) {
        const mid = (w.s0 + w.s1) / 2;
        // keep clear of any window already on this wall
        const clash = out.find((o) => o.wallId === w.id);
        const center = clash ? Math.min(w.s1 - 0.8, clash.center + clash.width / 2 + 0.9) : mid;
        out.push(base(`${room.id}:entrance`, w, room, null, 'entrance', center, 1.2, 0, 2.4));
      }
    }

    // ---- doors from adjacency
    const prov = ACCESS[room.type];
    if (!prov) continue;
    const isMainCorridor = room.type === 'corridor' && level.rooms.filter((r) => r.type === 'corridor').every((r) => area(roomRect(r)) <= area(roomRect(room)));
    if (isMainCorridor) continue;
    let chosen: { w: Wall; other: Room } | null = null;
    for (const t of prov) {
      const cands = walls
        .filter((w) => !w.external && (w.neg === room.id || w.pos === room.id))
        .map((w) => ({ w, other: rooms.get(w.neg === room.id ? w.pos! : w.neg!)! }))
        .filter((x) => x.other && x.other.type === t && wallLength(x.w) >= 0.7)
        .sort((a, b) => wallLength(b.w) - wallLength(a.w));
      if (cands.length) { chosen = cands[0]; break; }
    }
    if (!chosen) continue;
    // don't duplicate a door already created from the other room's side
    if (out.some((o) => o.wallId === chosen!.w.id && !o.external)) continue;
    const len = wallLength(chosen.w);
    const open = OPEN_PLAN.includes(room.type) && OPEN_PLAN.includes(chosen.other.type);
    if (open) {
      const width = Math.min(room.type === 'dining' || room.type === 'stair' || room.type === 'corridor' ? len - 0.3 : 1.5, len - 0.3);
      out.push(base(`${room.id}:open:${chosen.other.id}`, chosen.w, room, chosen.other, 'opening', (chosen.w.s0 + chosen.w.s1) / 2, r3(Math.max(0.6, width)), 0, 2.4));
    } else {
      const width = Math.min(DOOR_W[room.type] ?? 0.9, len - 0.3);
      const center = chosen.w.s0 + 0.2 + width / 2;
      const o = base(`${room.id}:door:${chosen.other.id}`, chosen.w, room, chosen.other, 'door', r3(center), r3(Math.max(0.6, width)), 0, 2.1);
      o.swingInto = room.id;
      out.push(o);
    }
  }

  // ---- overrides, clamping, areas
  const wallsById = new Map(walls.map((w) => [w.id, w]));
  const final: Opening[] = [];
  for (const o of out) {
    const ov = overrides[o.id];
    if (ov?.suppressed) continue;
    if (ov) {
      o.overridden = true;
      if (ov.width !== undefined) o.width = ov.width;
      if (ov.sill !== undefined) o.sill = ov.sill;
      if (ov.head !== undefined) o.head = ov.head;
      if (ov.shift !== undefined) o.center += ov.shift;
    }
    const w = wallsById.get(o.wallId)!;
    const pier = o.external ? 0.3 : 0.1;
    o.width = Math.min(o.width, wallLength(w) - 2 * pier);
    o.center = clamp(o.center, w.s0 + pier + o.width / 2, w.s1 - pier - o.width / 2);
    o.head = Math.max(o.head, o.sill + 0.3);
    const a = o.width * (o.head - o.sill);
    if (o.kind === 'window') { o.glazedArea = a; o.ventArea = a * 0.5; }
    else if (o.kind === 'ventilator') { o.glazedArea = a; o.ventArea = a * 0.8; }
    else if (o.kind === 'garden') { o.glazedArea = a * 0.7; o.ventArea = a * 0.5; }
    o.leaves = o.kind === 'window' ? Math.max(1, Math.ceil(o.width / 0.75 - 1e-6)) : o.kind === 'entrance' && o.width >= 1.1 ? 2 : 1;
    final.push(o);
  }
  // habitable screens must pass the room's required ventilation (1/20 floor area) through its glazing
  for (const room of level.rooms) {
    if (!HABITABLE.includes(room.type)) continue;
    const wins = final.filter((o) => o.roomId === room.id && o.kind === 'window');
    const glaz = wins.reduce((a, o) => a + o.glazedArea, 0);
    const reqVent = area(clearRect(room, walls)) / 20;
    for (const o of wins) o.reqRatio = clamp(glaz > 0 ? reqVent / glaz : 1, 0.2, 1);
  }
  return final;
}

/** sequential tags across the project: W01…, D01… */
export function tagOpenings(all: Opening[]) {
  let w = 0, d = 0;
  for (const o of all) {
    if (o.kind === 'window' || o.kind === 'ventilator') o.tag = (o.kind === 'ventilator' ? 'V' : 'W') + String(++w).padStart(2, '0');
    else if (o.kind !== 'opening') o.tag = 'D' + String(++d).padStart(2, '0');
    else o.tag = 'O';
  }
}
