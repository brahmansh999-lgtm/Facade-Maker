import type { Warning } from './types.ts';
import type { Derived } from './derive.ts';
import { EXT_WALL, INT_WALL } from './units.ts';
import { HABITABLE } from '../geometry/openings.ts';
import { area, overlap, roomRect, rw, rh, union } from '../geometry/rect.ts';
import { gridLines } from '../geometry/faces.ts';
import { Region } from '../geometry/region.ts';
import { MAX_RISER, MIN_TREAD } from '../geometry/stair.ts';

const f2 = (n: number) => n.toFixed(2);
const WET_STACK = ['bath', 'wc', 'utility', 'shaft', 'kitchen'];

export function validate(d: Derived): Warning[] {
  const W: Warning[] = [];
  const p = d.project;
  const push = (w: Warning) => W.push(w);

  for (const u of p.unplaced) push({ code: 'programme', severity: 'fail', message: `${u} could not be placed in the footprint` });

  // ---- rooms
  for (const L of d.levels) {
    const lv = L.level.index;
    for (const r of L.level.rooms) {
      const c = L.clear.get(r.id)!;
      const A = area(c), a = Math.min(rw(c), rh(c)), b = Math.max(rw(c), rh(c));
      const ref = r.id;
      if (r.type === 'bedroom') {
        if (A < 9.5) push({ code: 'room.area', severity: 'fail', level: lv, ref, message: `${r.name}: ${f2(A)} m² < 9.50 m² minimum` });
        if (a < 2.7) push({ code: 'room.width', severity: 'fail', level: lv, ref, message: `${r.name}: width ${f2(a)} m < 2.70 m` });
      }
      if (r.type === 'kitchen' && A < 5.5) push({ code: 'room.area', severity: 'fail', level: lv, ref, message: `${r.name}: ${f2(A)} m² < 5.50 m²` });
      if ((r.type === 'wc' || r.type === 'bath') && (a < 1.2 || b < 1.8)) push({ code: 'room.size', severity: 'fail', level: lv, ref, message: `${r.name}: ${f2(a)} × ${f2(b)} m < 1.20 × 1.80 m` });
      if (r.type === 'corridor' && a < 1.0) push({ code: 'corridor', severity: 'fail', level: lv, ref, message: `${r.name}: clear width ${f2(a)} m < 1.00 m` });

      if (HABITABLE.includes(r.type)) {
        const wins = L.openings.filter((o) => o.roomId === r.id && (o.kind === 'window' || o.kind === 'garden'));
        if (!wins.length) push({ code: 'light', severity: 'fail', level: lv, ref, message: `${r.name}: no external wall — no daylight or ventilation` });
        else {
          const g = wins.reduce((s, o) => s + o.glazedArea, 0), v = wins.reduce((s, o) => s + o.ventArea, 0);
          if (g < A / 10 - 1e-6) push({ code: 'light', severity: 'fail', level: lv, ref, message: `${r.name}: glazing ${f2(g)} m² < 1/10 floor (${f2(A / 10)})` });
          if (v < A / 20 - 1e-6) push({ code: 'vent', severity: 'fail', level: lv, ref, message: `${r.name}: opening ${f2(v)} m² < 1/20 floor (${f2(A / 20)})` });
        }
      }
      // access
      const needsDoor = !['void', 'shaft'].includes(r.type);
      const isMain = r.type === 'corridor' && L.level.rooms.filter((x) => x.type === 'corridor').every((x) => area(roomRect(x)) <= area(roomRect(r)));
      if (needsDoor && !isMain && !L.openings.some((o) => !o.external && (o.roomId === r.id || o.otherRoomId === r.id))) {
        push({ code: 'access', severity: 'warn', level: lv, ref, message: `${r.name}: no door from circulation` });
      }
    }
    // overlaps / gaps
    const rs = L.level.rooms.map((r) => ({ r, b: roomRect(r) }));
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      if (overlap(rs[i].b, rs[j].b) > 0.01) push({ code: 'overlap', severity: 'fail', level: lv, ref: rs[i].r.id, message: `${rs[i].r.name} overlaps ${rs[j].r.name}` });
    }
    const sum = rs.reduce((s, x) => s + area(x.b), 0);
    const fpA = Region.of(rs.map((x) => x.b)).area();
    if (sum < fpA - 0.05) push({ code: 'gap', severity: 'warn', level: lv, message: `L${lv}: ${f2(fpA - sum)} m² of the footprint is not assigned to a room` });
    // walls are generated to rule; this guards the derivation itself
    if (L.walls.some((w) => w.thickness !== (w.external ? EXT_WALL : INT_WALL))) push({ code: 'wall', severity: 'fail', level: lv, message: 'Wall thickness does not follow 230 ext. / 115 int.' });
    // wet stacking
    if (lv > 0) {
      const below = d.levels[lv - 1].level.rooms.filter((r) => WET_STACK.includes(r.type)).map(roomRect);
      for (const r of L.level.rooms.filter((x) => ['bath', 'wc', 'utility'].includes(x.type))) {
        const b = roomRect(r);
        const ov = below.reduce((s, x) => s + overlap(b, x), 0);
        if (ov < area(b) * 0.5) push({ code: 'stack', severity: 'warn', level: lv, ref: r.id, message: `${r.name} on L${lv} is not stacked over a wet zone` });
      }
    }
  }

  // ---- stair
  const s = d.stair;
  if (s.R > MAX_RISER + 1e-6) push({ code: 'stair', severity: 'fail', message: `Riser ${Math.round(s.R * 1000)} > 175 mm` });
  if (s.T < MIN_TREAD - 1e-6) push({ code: 'stair', severity: 'fail', message: `Tread ${Math.round(s.T * 1000)} < 250 mm` });
  if (s.twoRT < 0.6 - 1e-6 || s.twoRT > 0.64 + 1e-6) push({ code: 'stair', severity: 'fail', message: `2R+T = ${Math.round(s.twoRT * 1000)} mm, outside 600–640` });
  if (s.headroom < 2.1) push({ code: 'stair', severity: 'fail', message: `Headroom ${f2(s.headroom)} m < 2.10 m` });
  if (s.landing < s.width - 1e-6) push({ code: 'stair', severity: 'fail', message: `Landing ${f2(s.landing)} m shallower than stair width ${f2(s.width)} m` });
  if (s.long < s.requiredLength - 1e-3) push({ code: 'stair', severity: 'fail', message: `Stair needs ${f2(s.requiredLength)} m clear run, enclosure gives ${f2(s.long)} m` });
  if (s.short < s.requiredWidth - 1e-3) push({ code: 'stair', severity: 'fail', message: `Stair needs ${f2(s.requiredWidth)} m width, enclosure gives ${f2(s.short)} m` });

  // ---- structure
  const g = gridLines(p);
  p.grid.xBays.forEach((b, i) => { if (b > 5.5 + 1e-6) push({ code: 'span', severity: 'warn', message: `Span ${g.xs[i].label}–${g.xs[i + 1].label} is ${f2(b)} m (> 5.50)` }); });
  p.grid.yBays.forEach((b, i) => { if (b > 5.5 + 1e-6) push({ code: 'span', severity: 'warn', message: `Span ${g.ys[i].label}–${g.ys[i + 1].label} is ${f2(b)} m (> 5.50)` }); });
  const fp = d.levels[0] ? union(d.levels[0].level.rooms.map(roomRect)) : d.footprint;
  const gx0 = g.xs[0].v, gx1 = g.xs[g.xs.length - 1].v, gy0 = g.ys[0].v, gy1 = g.ys[g.ys.length - 1].v;
  if ([gx0 - fp.x0, gx1 - fp.x1, gy0 - fp.y0, gy1 - fp.y1].some((v) => Math.abs(v) > 0.01)) {
    push({ code: 'grid', severity: 'fail', message: 'Footprint corners are off the structural grid — columns would not land on grid' });
  }

  // ---- site
  const o = d.outlines[0] ?? d.outer, sb = p.site.setbacks;
  // upper-floor projections (cantilevers, lids) may reach half the front setback, at most 3.0 m
  const PROJ = Math.min(3.0, sb.front / 2);
  const up = d.outer;
  if (up.y0 < sb.front - PROJ - 1e-3) push({ code: 'setback', severity: 'fail', message: `Cantilever reaches ${f2(sb.front - up.y0)} m into the front setback (max ${PROJ})` });
  if (o.x0 < sb.left - 1e-3) push({ code: 'setback', severity: 'fail', message: `Left setback breached by ${f2(sb.left - o.x0)} m` });
  if (o.x1 > p.site.width - sb.right + 1e-3) push({ code: 'setback', severity: 'fail', message: `Right setback breached by ${f2(o.x1 - (p.site.width - sb.right))} m` });
  if (o.y0 < sb.front - 1e-3) push({ code: 'setback', severity: 'fail', message: `Front setback breached by ${f2(sb.front - o.y0)} m` });
  if (o.y1 > p.site.depth - sb.rear + 1e-3) push({ code: 'setback', severity: 'fail', message: `Rear setback breached by ${f2(o.y1 - (p.site.depth - sb.rear))} m` });
  if (p.brief.parking > 0) {
    if (sb.front < 5.5) push({ code: 'parking', severity: 'warn', message: `Front setback ${f2(sb.front)} m is too short for a 5.0 m car bay + 0.5 m` });
    if (p.brief.parking * 2.7 > p.site.width - 1.0) push({ code: 'parking', severity: 'warn', message: `${p.brief.parking} car bays (2.7 m) do not fit the frontage` });
  }
  // ---- facade
  for (const side of ['front', 'right', 'rear', 'left'] as const) {
    const f = d.faces[side];
    for (const i of f.issues) push({ code: 'facade', severity: 'fail', message: `${f.face.key} elev. (${f.type.name}): ${i.detail}`, ref: i.openingTag });
  }
  return W;
}
