// Push and pull of the volume. The plan layout stays the authority; massing is applied on top at
// derive time by moving room edges (and adding a lounge bay on a deep cantilever), so a storey's
// outline becomes any rectilinear shape: an L where only the wing cantilevers, a notch at the
// recessed entrance, a step where the wing slides back from the rear.
import type { Level, Massing, Room, StairRect } from '../model/types.ts';
import { EXT_WALL } from '../model/units.ts';
import { polyOf, roomRect, type Rect } from './rect.ts';
import { Region } from './region.ts';

const FIXED = new Set(['stair', 'void']);
/** cantilever depth from which the projection is its own room, carried on columns */
export const BAY = 1.8;

type Pick = (r: Room, b: Rect) => boolean;

/** move the y0 (front) or y1 (rear) edge of the picked rooms on that edge; by > 0 grows a front edge / shrinks a rear one */
function moveEdge(level: Level, edge: 'y0' | 'y1', by: number, pick: Pick, minDepth = 1.2): Level {
  if (!level.rooms.length || Math.abs(by) < 1e-6) return level;
  const rs = level.rooms.map(roomRect);
  const lim = edge === 'y0' ? Math.min(...rs.map((r) => r.y0)) : Math.max(...rs.map((r) => r.y1));
  const on = level.rooms.map((r, i) => Math.abs(rs[i][edge] - lim) < 1e-3 && pick(r, rs[i]));
  const moving = level.rooms.filter((_, i) => on[i]);
  if (!moving.length || moving.some((r) => FIXED.has(r.type))) return level;
  const depth = (b: Rect) => b.y1 - b.y0 + (edge === 'y0' ? by : -by);
  if (level.rooms.some((_, i) => on[i] && depth(rs[i]) < minDepth)) return level;
  const rooms: Room[] = level.rooms.map((r, i) => {
    if (!on[i]) return r;
    const b = { ...rs[i] };
    if (edge === 'y0') b.y0 -= by; else b.y1 -= by;
    return { ...r, polygon: polyOf(b) };
  });
  return { ...level, rooms };
}

/** project the front of the picked rooms; a deep projection becomes a lounge bay, the corridor runs on into it */
function cantilever(level: Level, c: number, pick: Pick): Level {
  if (c < BAY) return moveEdge(level, 'y0', c, pick);
  const rs = level.rooms.map(roomRect);
  const lim = Math.min(...rs.map((r) => r.y0));
  const on = level.rooms.map((r, i) => Math.abs(rs[i].y0 - lim) < 1e-3 && pick(r, rs[i]));
  if (!on.some(Boolean) || level.rooms.some((r, i) => on[i] && FIXED.has(r.type))) return level;
  const bays: Room[] = [];
  const rooms = level.rooms.map((r, i) => {
    if (!on[i]) return r;
    const b = rs[i];
    if (r.type === 'corridor') return { ...r, polygon: polyOf({ ...b, y0: b.y0 - c }) };
    bays.push({ id: `${r.id}-bay`, type: 'family', name: '', polygon: polyOf({ x0: b.x0, x1: b.x1, y0: b.y0 - c, y1: b.y0 }) });
    return r;
  });
  bays.forEach((b, k) => { b.name = bays.length > 1 ? `LOUNGE ${k + 1}` : 'LOUNGE'; });
  return { ...level, rooms: [...rooms, ...bays] };
}

export function applyMassing(levels: Level[], m: Massing, stair: StairRect): Level[] {
  const n = levels.length;
  // the wing is everything beside the stair's column; 'full' moves the whole front
  const sx0 = stair.x, sx1 = stair.x + stair.w;
  const inWing = (b: Rect) => m.span === 'full' || b.x1 <= sx0 + 1e-3 || b.x0 >= sx1 - 1e-3;
  return levels.map((l, i) => {
    let out = l;
    if (i === 0 && m.porch > 0) out = moveEdge(out, 'y0', -m.porch, (r, b) => r.type === 'corridor' || r.type === 'foyer' || !inWing(b), 1.8);
    if (i >= 1 && m.cantilever > 0) out = cantilever(out, m.cantilever, (_, b) => inWing(b));
    if (i >= 1 && m.slide > 0) out = moveEdge(out, 'y1', m.slide, (_, b) => inWing(b), 2.4);
    if (n >= 2 && i === n - 1 && m.terrace > 0) out = moveEdge(out, 'y1', m.terrace, () => true);
    return out;
  });
}

/** the true outer outline of one storey (outer wall faces) */
export const levelRegion = (level: Level): Region => Region.of(level.rooms.map(roomRect)).inflate(EXT_WALL / 2);
