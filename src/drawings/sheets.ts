// The drawing set: sheet registry + renderers producing complete A3 SVG sheets.
import type { Derived } from '../model/derive.ts';
import { orientationFor, runFacade } from '../model/derive.ts';
import type { Side } from '../model/types.ts';
import { SIDES } from '../geometry/faces.ts';
import { getFacade, fnum } from '../facades/registry.ts';
import { View, W, type Painter } from './painter.ts';
import { INK } from './color.ts';
import { AREA, fitScale, sheetSVG, type SheetMeta } from './sheet.ts';
import { drawPlan, planLayout } from './plan.ts';
import { drawElevation, elevExtents, elevSpan, elevationTitle } from './elevation.ts';
import { drawSection, sectionGeom, sectionLayout } from './section.ts';
import { drawRoof, roofLayout } from './roof.ts';
import { TXT, scaleBar } from './annot.ts';

export interface SheetDef { id: string; number: string; title: string; kind: SheetMeta['kind']; level?: number; side?: Side }

const LEVEL_NAME = ['GROUND', 'FIRST', 'SECOND', 'THIRD'];

export function sheetList(d: Derived): SheetDef[] {
  const out: SheetDef[] = d.levels.map((L, i) => ({ id: `plan-${i}`, number: `A-10${i + 1}`, title: `${LEVEL_NAME[i]} FLOOR PLAN`, kind: 'plan' as const, level: i }));
  out.push({ id: 'roof', number: `A-10${d.levels.length + 1}`, title: 'SITE & ROOF PLAN', kind: 'roof' });
  SIDES.forEach((s, i) => out.push({ id: `elev-${s}`, number: `A-20${i + 1}`, title: elevationTitle(d, s), kind: 'elevation', side: s }));
  out.push({ id: 'section', number: 'A-301', title: 'SECTION A–A THROUGH STAIR', kind: 'section' });
  return out;
}

export function elevLayout(d: Derived, side: Side) {
  const f = d.faces[side].face;
  const { lo, hi } = elevSpan(d, side);
  const e = elevExtents(f, hi - lo - f.width);
  const scale = fitScale(e.w, e.h);
  const k = 1000 / scale;
  const cx = (AREA.x0 + AREA.x1) / 2, cy = (AREA.y0 + AREA.y1) / 2;
  return { view: new View(cx - ((lo + hi) / 2 + 1.0) * k, cy + (e.h / 2 - 3.0) * k, k), scale };
}

/** sheet-mm rectangles framing just the drawing, for the default on-screen view */
export function drawingFocus(d: Derived, id: string) {
  const rect = (x0: number, y0: number, x1: number, y1: number) => ({ x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) });
  if (id.startsWith('elev-')) {
    const side = id.slice(5) as Side;
    const f = d.faces[side].face;
    const v = elevLayout(d, side).view;
    const { lo, hi } = elevSpan(d, side);
    return rect(v.X(lo - 2.6), v.Y(Math.max(f.parapetTop, f.mumty?.z1 ?? 0) + 1.8), v.X(hi + 4.6), v.Y(-3.0));
  }
  if (id.startsWith('plan-')) {
    const v = planLayout(d).view, o = d.outer;
    return rect(v.X(o.x0 - 4.2), v.Y(o.y1 + 2.4), v.X(o.x1 + 2.4), v.Y(o.y0 - 4.0));
  }
  if (id === 'section') {
    const v = sectionLayout(d).view;
    const g = sectionGeom(d);
    const top = d.faces.front.face.parapetTop + 3.2;
    const xs = [v.X(g.H(g.a0)), v.X(g.H(g.a1))];
    return rect(Math.min(...xs) - 20, v.Y(top + 1.6), Math.max(...xs) + 34, v.Y(-4.2));
  }
  return undefined;
}

function flaggedRooms(d: Derived) {
  return new Set(d.warnings.filter((w) => w.ref && w.code !== 'facade').map((w) => w.ref!));
}

export function renderSheet(d: Derived, id: string): string {
  const def = sheetList(d).find((s) => s.id === id) ?? sheetList(d)[0];
  const name = d.project.name;
  if (def.kind === 'plan') {
    const { view, scale } = planLayout(d);
    const meta: SheetMeta = { id, number: def.number, title: def.title, scale, kind: 'plan' };
    return sheetSVG(meta, name, (pt) => drawPlan(pt, d, def.level!, view, { flagged: flaggedRooms(d), scale, title: def.title }));
  }
  if (def.kind === 'roof') {
    const { view, scale } = roofLayout(d);
    return sheetSVG({ id, number: def.number, title: def.title, scale, kind: 'roof' }, name, (pt) => drawRoof(pt, d, view, def.title, scale));
  }
  if (def.kind === 'elevation') {
    const side = def.side!;
    const fd = d.faces[side];
    const { view, scale } = elevLayout(d, side);
    const sub = `${fnum(fd.type.num)} ${fd.type.name.toUpperCase()}`;
    const flagged = new Set(fd.issues.map((i) => i.openingTag));
    return sheetSVG({ id, number: def.number, title: def.title, subtitle: sub, scale, kind: 'elevation' }, name, (pt) => {
      drawElevation(pt, d, side, view, { tags: true, flagged });
      drawingLabel(pt, def.title, `FACADE ${sub}${fd.overridden ? ' (ELEVATION OVERRIDE)' : ''} · ${fd.palette.name.toUpperCase()} · EXPOSURE ${Math.round(fd.orient.exposure * 100)}%`, view.k, scale);
    });
  }
  const { view, scale } = sectionLayout(d);
  return sheetSVG({ id, number: def.number, title: def.title, scale, kind: 'section' }, name, (pt) => {
    drawSection(pt, d, view);
    drawingLabel(pt, def.title, `CUT ALONG STAIR, LOOKING TOWARD UPPER FLIGHT · 1:${scale}`, view.k, scale);
  });
}

function drawingLabel(pt: Painter, title: string, sub: string, k: number, scale: number) {
  const ty = AREA.y1 - 3;
  pt.text(AREA.x0, ty, title, { size: TXT.title, weight: 600, spacing: 0.25 });
  pt.line(AREA.x0, ty + 1.2, AREA.x0 + 90, ty + 1.2, { stroke: INK, sw: W.PROJ });
  pt.text(AREA.x0, ty + 4.4, sub, { size: 1.8, font: 'mono' });
  scaleBar(pt, AREA.x1 - 70, ty - 1, k, scale);
}

/** 2–4 facades on the same elevation, side by side at one common scale */
export function renderCompare(d: Derived, side: Side, typeIds: string[]): string {
  const p = d.project;
  const fd = d.faces[side];
  const f = fd.face;
  const n = Math.max(1, typeIds.length);
  const gap = 2.6;
  const e = elevExtents(f);
  const totalW = n * f.width + (n - 1) * gap + 6;
  const scale = fitScale(totalW, e.h);
  const k = 1000 / scale;
  const cx = (AREA.x0 + AREA.x1) / 2, cy = (AREA.y0 + AREA.y1) / 2;
  const startU = -(n * f.width + (n - 1) * gap) / 2;
  const title = `COMPARE · ${elevationTitle(d, side)}`;
  return sheetSVG({ id: 'compare', number: 'A-210', title, subtitle: `${n} FACADES`, scale, kind: 'compare' }, p.name, (pt) => {
    typeIds.forEach((tid, i) => {
      const t = getFacade(tid);
      const params = p.facade.typeParams[t.id] ?? {};
      const pal = t.palettes[p.facade.typePalette[t.id] ?? 0];
      const out = runFacade(t, f, orientationFor(p, f, d.sun[side]), params, pal);
      const ox = cx + (startU + i * (f.width + gap)) * k;
      const v = new View(ox, cy + (e.h / 2 - 3.0) * k, k);
      drawElevation(pt, d, side, v, { prims: out.prims, datums: i === n - 1, grid: true, dims: true });
      pt.text(v.X(0), v.Y(-3.3), `${fnum(t.num)}  ${t.name.toUpperCase()}`, { size: 2.4, weight: 600, spacing: 0.15 });
      pt.text(v.X(0), v.Y(-3.3) + 3.4, `${out.prims.length} ELEMENTS · ${pal.name.toUpperCase()}`, { size: 1.5, font: 'mono' });
    });
    drawingLabel(pt, title, `SAME FACE, SAME SCALE 1:${scale} · CLIMATE RESPONSE ${p.facade.climateResponse ? 'ON' : 'OFF'}`, k, scale);
  });
}
