import type { Face, FacadeOutput } from './types.ts';
import { primBox } from '../drawings/primDraw.ts';

export interface FacadeIssue { openingTag: string; kind: 'covers' | 'porosity' | 'door' | 'offset'; detail: string }

/**
 * Every facade element is checked against every opening on its face (elevation projection):
 *  - a solid element may not overlap an opening at all;
 *  - nothing may stand in front of a door;
 *  - a screen in front of a window must stand off the wall and keep porosity ≥ the opening's need.
 */
export function checkFacade(face: Face, out: FacadeOutput): FacadeIssue[] {
  const issues = new Map<string, FacadeIssue>();
  const boxes = out.prims.map((p) => ({ p, b: primBox(p) }));
  for (const o of face.openings) {
    for (const { p, b } of boxes) {
      const w = Math.min(b.u1, o.u1) - Math.max(b.u0, o.u0);
      const h = Math.min(b.z1, o.z1) - Math.max(b.z0, o.z0);
      if (w <= 0.005 || h <= 0.005 || w * h < 1e-4) continue;
      if (p.kind === 'line' && (p.porosity ?? 0.98) >= 0.9 && !o.door) continue;
      let issue: FacadeIssue | null = null;
      if (o.door) issue = { openingTag: o.tag, kind: 'door', detail: `element in front of door ${o.tag}` };
      else if (p.role === 'solid') issue = { openingTag: o.tag, kind: 'covers', detail: `solid ${p.kind} covers ${o.tag}` };
      else if (b.d0 < 0.04) issue = { openingTag: o.tag, kind: 'offset', detail: `screen at ${Math.round(b.d0 * 1000)} mm off ${o.tag} (min 40)` };
      else if ((p.porosity ?? 0) + 1e-6 < o.reqRatio) issue = { openingTag: o.tag, kind: 'porosity', detail: `screen ${Math.round((p.porosity ?? 0) * 100)}% open over ${o.tag}, needs ${Math.round(o.reqRatio * 100)}%` };
      if (issue) issues.set(`${o.tag}:${issue.kind}`, issue);
    }
  }
  return [...issues.values()];
}
