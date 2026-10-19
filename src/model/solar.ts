// Simple solar geometry for facade climate response.
// Exposure = weighted sum of direct-beam incidence on a vertical face across solstices and
// equinox (afternoon hours weighted up for heat gain), normalised against the worst face.

const D2R = Math.PI / 180;

export interface SunSample { alt: number; az: number; w: number }

export function sunPath(latitude: number): SunSample[] {
  const out: SunSample[] = [];
  const phi = latitude * D2R;
  for (const [decl, wDay] of [[23.44, 1], [0, 1.3], [-23.44, 0.7]] as const) {
    const d = decl * D2R;
    for (let hour = 6; hour <= 18; hour += 0.5) {
      const h = (hour - 12) * 15 * D2R;
      const sinAlt = Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(h);
      const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
      if (alt <= 2 * D2R) continue;
      const cosAz = (Math.sin(d) - Math.sin(alt) * Math.sin(phi)) / (Math.cos(alt) * Math.cos(phi) || 1e-9);
      let az = Math.acos(Math.max(-1, Math.min(1, cosAz)));
      if (h > 0) az = 2 * Math.PI - az;
      const heat = hour > 12 ? 1.5 : 1;
      out.push({ alt, az, w: wDay * heat * Math.pow(Math.sin(alt), 0.35) });
    }
  }
  return out;
}

export interface FaceSun {
  exposure: number;      // 0..1 relative to the most exposed face
  raw: number;
  /** vertical shadow angle a horizontal device must cut off (deg), at peak weighted incidence */
  cutoff: number;
  /** horizontal shadow angle for vertical fins (deg) */
  hsa: number;
}

export function faceSun(latitude: number, bearings: number[]): FaceSun[] {
  const path = sunPath(latitude);
  const raw = bearings.map((b) => {
    const beta = b * D2R;
    let e = 0, best = 0, cut = 45, hsa = 30;
    for (const s of path) {
      const dAz = s.az - beta;
      const inc = Math.cos(s.alt) * Math.cos(dAz);
      if (inc <= 0) continue;
      const v = inc * s.w;
      e += v;
      if (v > best) {
        best = v;
        cut = Math.atan(Math.tan(s.alt) / Math.max(0.05, Math.cos(dAz))) / D2R;
        hsa = Math.abs(((dAz / D2R + 540) % 360) - 180);
      }
    }
    return { e, cut, hsa };
  });
  const max = Math.max(...raw.map((r) => r.e), 1e-9);
  return raw.map((r) => ({ exposure: r.e / max, raw: r.e, cutoff: Math.max(15, Math.min(80, r.cut)), hsa: Math.max(5, Math.min(85, r.hsa)) }));
}
