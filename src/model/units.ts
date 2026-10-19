export const MODULE = 0.15;
export const EXT_WALL = 0.23;
export const INT_WALL = 0.115;
export const SLAB = 0.15;
export const PARAPET = 1.0;
export const MUMTY_HEIGHT = 2.7;
export const EPS = 1e-6;

export const snap = (v: number, m = MODULE) => Math.round(v / m + EPS) * m;
export const snapUp = (v: number, m = MODULE) => Math.ceil(v / m - 1e-6) * m;
export const snapDown = (v: number, m = MODULE) => Math.floor(v / m + 1e-6) * m;
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const r3 = (v: number) => Math.round(v * 1000) / 1000;
export const near = (a: number, b: number, tol = 1e-4) => Math.abs(a - b) < tol;

/** "+3.650" style level text. */
export const levelText = (z: number) => (z >= 0 ? '+' : '−') + Math.abs(z).toFixed(3);
export const mm = (m: number) => String(Math.round(m * 1000));
export const m2 = (a: number) => a.toFixed(2);

/** Deterministic PRNG so generated patterns are stable between renders. */
export function rng(seed: number) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
