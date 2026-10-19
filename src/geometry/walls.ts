import type { Level, Room, Side } from '../model/types.ts';
import { EXT_WALL, INT_WALL, r3 } from '../model/units.ts';
import { roomRect } from './rect.ts';

export interface Wall {
  id: string;
  levelId: string;
  /** run direction: 'x' = wall runs along x (horizontal in plan) */
  run: 'x' | 'y';
  /** fixed coordinate (y for run x, x for run y) */
  c: number;
  s0: number;
  s1: number;
  thickness: number;
  external: boolean;
  /** room on the negative side (smaller c) and positive side */
  neg: string | null;
  pos: string | null;
  /** for external walls: which building side the outside faces */
  outside?: Side;
}

const key = (v: number) => Math.round(v * 1000);

/**
 * Derive wall segments from the room tiling. Every room edge is swept; elementary intervals
 * with identical room pairs on either side are merged into one segment. A segment with a room on
 * only one side is external (230), with rooms on both sides internal (115).
 */
export function deriveWalls(level: Level): Wall[] {
  const walls: Wall[] = [];
  const rects = level.rooms.map((r) => ({ r, b: roomRect(r) }));
  for (const run of ['x', 'y'] as const) {
    // collect lines: c -> list of {s0,s1,room,sideIsPos}
    const lines = new Map<number, { c: number; items: { s0: number; s1: number; room: Room; pos: boolean }[] }>();
    const add = (c: number, s0: number, s1: number, room: Room, pos: boolean) => {
      const k = key(c);
      if (!lines.has(k)) lines.set(k, { c, items: [] });
      lines.get(k)!.items.push({ s0, s1, room, pos });
    };
    for (const { r, b } of rects) {
      if (run === 'x') {
        add(b.y0, b.x0, b.x1, r, true);   // room lies on +y side of its bottom edge
        add(b.y1, b.x0, b.x1, r, false);
      } else {
        add(b.x0, b.y0, b.y1, r, true);
        add(b.x1, b.y0, b.y1, r, false);
      }
    }
    for (const { c, items } of lines.values()) {
      const pts = [...new Set(items.flatMap((i) => [key(i.s0), key(i.s1)]))].sort((a, b) => a - b).map((v) => v / 1000);
      let cur: Wall | null = null;
      for (let k = 0; k < pts.length - 1; k++) {
        const a = pts[k], b = pts[k + 1];
        const mid = (a + b) / 2;
        const posRoom = items.find((i) => i.pos && i.s0 <= mid && i.s1 >= mid)?.room ?? null;
        const negRoom = items.find((i) => !i.pos && i.s0 <= mid && i.s1 >= mid)?.room ?? null;
        if (!posRoom && !negRoom) { if (cur) walls.push(cur); cur = null; continue; }
        const negId = negRoom?.id ?? null, posId = posRoom?.id ?? null;
        if (cur && cur.neg === negId && cur.pos === posId && Math.abs(cur.s1 - a) < 1e-6) { cur.s1 = b; continue; }
        if (cur) walls.push(cur);
        const external = !negRoom || !posRoom;
        const outside: Side | undefined = !external ? undefined
          : run === 'x' ? (!negRoom ? 'front' : 'rear') : (!negRoom ? 'left' : 'right');
        cur = {
          id: `${level.id}-${run}${key(c)}-${key(a)}`, levelId: level.id, run, c: r3(c), s0: a, s1: b,
          thickness: external ? EXT_WALL : INT_WALL, external, neg: negId, pos: posId, outside,
        };
      }
      if (cur) walls.push(cur);
    }
  }
  return walls;
}

export const wallLength = (w: Wall) => w.s1 - w.s0;
/** the room on the inside of an external wall */
export const insideRoom = (w: Wall) => w.neg ?? w.pos;
