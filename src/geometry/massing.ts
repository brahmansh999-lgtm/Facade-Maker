// Push and pull of the volume. The plan layout stays the authority; massing is applied on top at
// derive time by moving whole outline edges of a level, so every level outline stays a rectangle.
import type { Level, Massing, Room } from '../model/types.ts';
import { polyOf, roomRect, union, type Rect } from './rect.ts';
import { outerRect } from './faces.ts';

const FIXED = new Set(['stair', 'void']);

function moveEdge(level: Level, edge: 'y0' | 'y1', by: number): Level {
  if (!level.rooms.length || Math.abs(by) < 1e-6) return level;
  const rs = level.rooms.map(roomRect);
  const lim = edge === 'y0' ? Math.min(...rs.map((r) => r.y0)) : Math.max(...rs.map((r) => r.y1));
  const on = (r: Rect) => Math.abs(r[edge] - lim) < 1e-3;
  const moving = level.rooms.filter((_, i) => on(rs[i]));
  if (moving.some((r) => FIXED.has(r.type))) return level;
  // never squeeze a room below 1.2 m deep
  if (moving.some((r) => { const b = roomRect(r); return b.y1 - b.y0 + (edge === 'y0' ? by : -by) < 1.2; })) return level;
  const rooms: Room[] = level.rooms.map((r, i) => {
    if (!on(rs[i])) return r;
    const b = { ...rs[i] };
    if (edge === 'y0') b.y0 -= by; else b.y1 -= by;
    return { ...r, polygon: polyOf(b) };
  });
  return { ...level, rooms };
}

/** cantilever: upper levels grow forward; terrace: the top level shrinks from the rear */
export function applyMassing(levels: Level[], m: Massing): Level[] {
  const n = levels.length;
  return levels.map((l, i) => {
    let out = l;
    if (i >= 1 && m.cantilever > 0) out = moveEdge(out, 'y0', m.cantilever);
    if (n >= 2 && i === n - 1 && m.terrace > 0) out = moveEdge(out, 'y1', m.terrace);
    return out;
  });
}

/** the outer wall face rectangle of one level */
export const levelOutline = (level: Level): Rect => outerRect(union(level.rooms.map(roomRect)));

/** deck strips a smaller storey leaves on the outline below it (rear terrace, side returns) */
export function terraceStrips(lo: Rect, up: Rect): (Rect & { open: 'y0' | 'y1' })[] {
  const out: (Rect & { open: 'y0' | 'y1' })[] = [];
  if (lo.y1 - up.y1 > 0.3) out.push({ x0: lo.x0, x1: lo.x1, y0: up.y1, y1: lo.y1, open: 'y1' });
  if (up.y0 - lo.y0 > 0.3) out.push({ x0: lo.x0, x1: lo.x1, y0: lo.y0, y1: up.y0, open: 'y0' });
  return out;
}
