// One drawing API, two back-ends: SVG strings (sheets, export) and Canvas 2D (catalogue thumbnails).
// All coordinates and stroke widths are sheet millimetres.

export interface Style {
  stroke?: string;
  sw?: number;
  fill?: string;
  dash?: number[];
  opacity?: number;
  cap?: 'butt' | 'round' | 'square';
}
export interface TextStyle {
  size: number;
  fill?: string;
  anchor?: 'start' | 'middle' | 'end';
  font?: 'mono' | 'sans';
  weight?: number;
  rotate?: number;
  baseline?: 'middle' | 'alphabetic' | 'hanging';
  spacing?: number;
}

export interface Painter {
  rect(x: number, y: number, w: number, h: number, s: Style): void;
  line(x1: number, y1: number, x2: number, y2: number, s: Style): void;
  poly(pts: number[], closed: boolean, s: Style): void;
  circle(cx: number, cy: number, r: number, s: Style): void;
  path(d: string, s: Style): void;
  text(x: number, y: number, str: string, t: TextStyle): void;
  begin(cls?: string): void;
  end(): void;
}

export const W = { CUT: 0.5, OUTLINE: 0.35, PROJ: 0.25, BEYOND: 0.13, THIN: 0.09 };
export const FONT_SANS = "'Archivo', 'Helvetica Neue', Arial, sans-serif";
export const FONT_MONO = "'IBM Plex Mono', 'Consolas', monospace";

const f = (n: number) => (Math.round(n * 1000) / 1000).toString();
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function svgStyle(s: Style) {
  let a = '';
  a += ` fill="${s.fill ?? 'none'}"`;
  if (s.stroke && (s.sw ?? 0) > 0) {
    a += ` stroke="${s.stroke}" stroke-width="${f(s.sw!)}"`;
    if (s.dash) a += ` stroke-dasharray="${s.dash.map(f).join(' ')}"`;
    if (s.cap) a += ` stroke-linecap="${s.cap}"`;
  }
  if (s.opacity !== undefined && s.opacity < 1) a += ` opacity="${f(s.opacity)}"`;
  return a;
}

export class SvgPainter implements Painter {
  out: string[] = [];
  rect(x: number, y: number, w: number, h: number, s: Style) {
    this.out.push(`<rect x="${f(x)}" y="${f(y)}" width="${f(Math.abs(w))}" height="${f(Math.abs(h))}"${svgStyle(s)}/>`);
  }
  line(x1: number, y1: number, x2: number, y2: number, s: Style) {
    this.out.push(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"${svgStyle(s)}/>`);
  }
  poly(pts: number[], closed: boolean, s: Style) {
    const p = [];
    for (let i = 0; i < pts.length; i += 2) p.push(`${f(pts[i])},${f(pts[i + 1])}`);
    this.out.push(`<${closed ? 'polygon' : 'polyline'} points="${p.join(' ')}"${svgStyle(s)}/>`);
  }
  circle(cx: number, cy: number, r: number, s: Style) {
    this.out.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}"${svgStyle(s)}/>`);
  }
  path(d: string, s: Style) { this.out.push(`<path d="${d}"${svgStyle(s)}/>`); }
  text(x: number, y: number, str: string, t: TextStyle) {
    const tr = t.rotate ? ` transform="rotate(${f(t.rotate)} ${f(x)} ${f(y)})"` : '';
    const fam = t.font === 'mono' ? FONT_MONO : FONT_SANS;
    this.out.push(`<text x="${f(x)}" y="${f(y)}" font-size="${f(t.size)}" font-family="${fam.replace(/"/g, "'")}" fill="${t.fill ?? '#1b1a17'}" text-anchor="${t.anchor ?? 'start'}" dominant-baseline="${t.baseline ?? 'alphabetic'}"${t.weight ? ` font-weight="${t.weight}"` : ''}${t.spacing ? ` letter-spacing="${f(t.spacing)}"` : ''}${tr}>${esc(str)}</text>`);
  }
  begin(cls?: string) { this.out.push(cls ? `<g class="${cls}">` : '<g>'); }
  end() { this.out.push('</g>'); }
  toString() { return this.out.join(''); }
}

export class CanvasPainter implements Painter {
  ctx: CanvasRenderingContext2D;
  k: number;
  minLine: number;
  constructor(ctx: CanvasRenderingContext2D, pxPerMm: number) {
    this.ctx = ctx; this.k = pxPerMm; this.minLine = 0.35;
  }
  private apply(s: Style, draw: () => void) {
    const c = this.ctx;
    c.save();
    c.globalAlpha = s.opacity ?? 1;
    draw();
    if (s.fill && s.fill !== 'none') { c.fillStyle = s.fill; c.fill(); }
    if (s.stroke && (s.sw ?? 0) > 0) {
      c.strokeStyle = s.stroke;
      c.lineWidth = Math.max(this.minLine, s.sw! * this.k);
      c.setLineDash(s.dash ? s.dash.map((d) => d * this.k) : []);
      c.lineCap = s.cap ?? 'butt';
      c.stroke();
    }
    c.restore();
  }
  rect(x: number, y: number, w: number, h: number, s: Style) {
    const k = this.k;
    this.apply(s, () => { this.ctx.beginPath(); this.ctx.rect(x * k, y * k, w * k, h * k); });
  }
  line(x1: number, y1: number, x2: number, y2: number, s: Style) {
    const k = this.k;
    this.apply({ ...s, fill: undefined }, () => { this.ctx.beginPath(); this.ctx.moveTo(x1 * k, y1 * k); this.ctx.lineTo(x2 * k, y2 * k); });
  }
  poly(pts: number[], closed: boolean, s: Style) {
    const k = this.k;
    this.apply(closed ? s : { ...s, fill: undefined }, () => {
      const c = this.ctx;
      c.beginPath();
      for (let i = 0; i < pts.length; i += 2) (i ? c.lineTo : c.moveTo).call(c, pts[i] * k, pts[i + 1] * k);
      if (closed) c.closePath();
    });
  }
  circle(cx: number, cy: number, r: number, s: Style) {
    const k = this.k;
    this.apply(s, () => { this.ctx.beginPath(); this.ctx.arc(cx * k, cy * k, Math.max(0.2, r * k), 0, Math.PI * 2); });
  }
  path(d: string, s: Style) {
    const c = this.ctx;
    c.save();
    c.scale(this.k, this.k);
    const p = new Path2D(d);
    if (s.fill && s.fill !== 'none') { c.fillStyle = s.fill; c.fill(p); }
    if (s.stroke) { c.strokeStyle = s.stroke; c.lineWidth = Math.max(this.minLine / this.k, s.sw ?? 0.1); c.stroke(p); }
    c.restore();
  }
  text(x: number, y: number, str: string, t: TextStyle) {
    const c = this.ctx;
    const px = t.size * this.k;
    if (px < 3) return;
    c.save();
    c.translate(x * this.k, y * this.k);
    if (t.rotate) c.rotate((t.rotate * Math.PI) / 180);
    c.font = `${t.weight ?? 400} ${px}px ${t.font === 'mono' ? FONT_MONO : FONT_SANS}`;
    c.fillStyle = t.fill ?? '#1b1a17';
    c.textAlign = t.anchor === 'middle' ? 'center' : t.anchor === 'end' ? 'right' : 'left';
    c.textBaseline = t.baseline === 'middle' ? 'middle' : t.baseline === 'hanging' ? 'top' : 'alphabetic';
    c.fillText(str, 0, 0);
    c.restore();
  }
  begin() {}
  end() {}
}

/** model→sheet mapping: sheet mm = origin + model m × k, y flipped (model up = sheet up) */
export class View {
  ox: number; oy: number; k: number; flip: boolean;
  constructor(ox: number, oy: number, k: number, flip = true) { this.ox = ox; this.oy = oy; this.k = k; this.flip = flip; }
  X = (x: number) => this.ox + x * this.k;
  Y = (y: number) => (this.flip ? this.oy - y * this.k : this.oy + y * this.k);
  L = (m: number) => m * this.k;
}
