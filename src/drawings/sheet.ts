// A3 sheet with a title block. Everything inside is sheet millimetres.
import { SvgPainter, W, FONT_MONO, FONT_SANS, type Painter } from './painter.ts';
import { INK, PAPER } from './color.ts';

export const A3 = { w: 420, h: 297 };
export const FRAME = { x0: 10, y0: 8, x1: 410, y1: 289 };
export const TB = { h: 18 };
/** drawable region above the title block */
export const AREA = { x0: 16, y0: 14, x1: 404, y1: FRAME.y1 - TB.h - 6 };
export const SCALES = [50, 100, 200, 250, 500];

export interface SheetMeta {
  id: string;
  number: string;
  title: string;
  subtitle?: string;
  scale: number;
  kind: 'plan' | 'elevation' | 'section' | 'roof' | 'compare';
}

export function fitScale(wM: number, hM: number, availW = AREA.x1 - AREA.x0, availH = AREA.y1 - AREA.y0, min = 50): number {
  for (const s of SCALES) {
    if (s < min) continue;
    if ((wM * 1000) / s <= availW && (hM * 1000) / s <= availH) return s;
  }
  return SCALES[SCALES.length - 1];
}

export const todayText = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};

export function drawTitleBlock(pt: Painter, meta: SheetMeta, project: string) {
  const f = FRAME;
  pt.rect(f.x0, f.y0, f.x1 - f.x0, f.y1 - f.y0, { stroke: INK, sw: W.OUTLINE });
  const y = f.y1 - TB.h;
  pt.line(f.x0, y, f.x1, y, { stroke: INK, sw: W.PROJ });
  const cells: { w: number; label: string; value: string; big?: boolean; mono?: boolean }[] = [
    { w: 92, label: 'PROJECT', value: project },
    { w: 150, label: 'DRAWING', value: meta.title + (meta.subtitle ? ' — ' + meta.subtitle : ''), big: true },
    { w: 40, label: 'SCALE', value: meta.kind === 'compare' ? `1:${meta.scale} (ALL)` : `1:${meta.scale} @ A3`, mono: true },
    { w: 36, label: 'DATE', value: todayText(), mono: true },
    { w: 24, label: 'REV', value: '—', mono: true },
    { w: 58, label: 'SHEET', value: meta.number, big: true, mono: true },
  ];
  let x = f.x0;
  cells.forEach((c, i) => {
    if (i > 0) pt.line(x, y, x, f.y1, { stroke: INK, sw: W.BEYOND });
    pt.text(x + 2, y + 4, c.label, { size: 1.6, spacing: 0.35, weight: 500 });
    const size = c.big ? 3.6 : 2.6;
    const maxChars = Math.floor((c.w - 4) / (size * 0.56));
    const v = c.value.length > maxChars ? c.value.slice(0, maxChars - 1) + '…' : c.value;
    pt.text(x + 2, y + 12.5, v, { size, font: c.mono ? 'mono' : 'sans', weight: c.big ? 600 : 400 });
    x += c.w;
  });
}

export function sheetSVG(meta: SheetMeta, project: string, body: (pt: SvgPainter) => void): string {
  const pt = new SvgPainter();
  pt.rect(0, 0, A3.w, A3.h, { fill: PAPER });
  body(pt);
  drawTitleBlock(pt, meta, project);
  const style = `<style>text{font-family:${FONT_SANS.replace(/"/g, "'")}}</style>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${A3.w} ${A3.h}" width="${A3.w}mm" height="${A3.h}mm" data-mono="${FONT_MONO.replace(/"/g, "'")}">${style}${pt}</svg>`;
}
