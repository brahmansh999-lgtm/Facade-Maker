export const INK = '#1b1a17';
export const PAPER = '#f2efe8';
export const ACCENT = '#a33b20';
export const GLASS = '#cfe0e4';
export const GLASS_DARK = '#59625f';

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
export function rgbToHex([r, g, b]: [number, number, number]) {
  const c = (x: number) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}
/** mix toward ink (k>0) or paper (k<0) */
export function shade(hex: string, k: number): string {
  const a = hexToRgb(hex);
  const t = hexToRgb(k >= 0 ? INK : '#ffffff');
  const m = Math.min(1, Math.abs(k));
  return rgbToHex([a[0] + (t[0] - a[0]) * m, a[1] + (t[1] - a[1]) * m, a[2] + (t[2] - a[2]) * m]);
}
export function mix(a: string, b: string, t: number) {
  const x = hexToRgb(a), y = hexToRgb(b);
  return rgbToHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}
/** flat tone for a facet with outward normal n (face-local u,z,d) — light from upper left, front */
export function facetTone(base: string, nu: number, nz: number, nd: number): string {
  const L = [-0.45, 0.55, 0.7];
  const len = Math.hypot(nu, nz, nd) || 1;
  const dot = (nu * L[0] + nz * L[1] + nd * L[2]) / len / Math.hypot(L[0], L[1], L[2]);
  // dot in [-1,1]: 1 → lighten a touch, 0 → darken
  return dot > 0.75 ? shade(base, -(dot - 0.75) * 0.6) : shade(base, (0.75 - dot) * 0.42);
}
