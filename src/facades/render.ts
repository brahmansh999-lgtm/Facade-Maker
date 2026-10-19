import type { FacadeType } from './types.ts';
import { Ctx, def, sz } from './kit.ts';
import { subtract } from '../geometry/rect.ts';
import { shade } from '../drawings/color.ts';

export const render: FacadeType = {
  id: 'render',
  num: 8,
  name: 'Lime render, deep reveals',
  description: 'The wall is thickened outward in lime render on a block backing so every opening reads as a deep punched hole. Jambs and heads splay outward to throw light in; cast sills project to shed water. Plinth and coping in a darker lime.',
  params: [
    def({ key: 'reveal', label: 'Reveal depth', unit: 'mm', min: 150, max: 600, step: 10, default: 300 }),
    def({ key: 'splay', label: 'Reveal splay', unit: '°', min: 0, max: 30, step: 1, default: 12 }),
    def({ key: 'sill', label: 'Cill projection', unit: 'mm', min: 0, max: 150, step: 5, default: 60 }),
    def({ key: 'plinth', label: 'Plinth band', unit: 'mm', min: 300, max: 900, step: 25, default: 600 }),
    def({ key: 'coping', label: 'Coping projection', unit: 'mm', min: 0, max: 150, step: 5, default: 50 }),
  ],
  palettes: [
    { name: 'Natural lime', primary: '#e8e1d2', secondary: '#d5ccba', accent: '#a9a091' },
    { name: 'Ochre limewash', primary: '#dcc08f', secondary: '#c8ab7a', accent: '#97866a' },
    { name: 'Pink chuna', primary: '#e3c4b4', secondary: '#cfae9e', accent: '#9d8478' },
  ],
  generate(face, openings, levels, orient, params, palette) {
    const c = new Ctx(render, face, openings, levels, orient, params, palette);
    const R = c.m('reveal') * c.clim(0.85, 1.4);
    const s = R * Math.tan((c.num('splay') * Math.PI) / 180);
    const cillP = c.m('sill');
    const plinthH = Math.max(c.bottom, c.m('plinth'));
    const cop = c.m('coping');
    // holes widen outward by the splay at jambs and head
    const holes = c.openings.map((o) => ({ x0: o.u0 - s, x1: o.u1 + s, y0: o.door ? -1 : o.z0, y1: o.z1 + s }));
    let area = 0;
    for (const r of subtract({ x0: 0, x1: c.width, y0: c.bottom, y1: c.top }, holes)) {
      c.add({ kind: 'box', role: 'solid', fill: palette.primary, u: r.x0, z: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0, d0: 0, d1: R });
      area += (r.x1 - r.x0) * (r.y1 - r.y0);
    }
    for (const o of c.openings) {
      if (s > 0.001) {
        // splayed jambs: wedge from the opening edge at the wall face to the widened edge at the outer face
        c.add({ kind: 'prismZ', role: 'solid', fill: palette.secondary, z0: o.door ? Math.max(c.bottom, o.z0) : o.z0, z1: o.z1 + s, pts: [[o.u0 - s, 0], [o.u0, 0], [o.u0 - s, R]] });
        c.add({ kind: 'prismZ', role: 'solid', fill: palette.secondary, z0: o.door ? Math.max(c.bottom, o.z0) : o.z0, z1: o.z1 + s, pts: [[o.u1, 0], [o.u1 + s, 0], [o.u1 + s, R]] });
        c.add({ kind: 'prismU', role: 'solid', fill: shade(palette.secondary, 0.06), u0: o.u0, u1: o.u1, pts: [[o.z1, 0], [o.z1 + s, 0], [o.z1 + s, R]] });
      }
      if (!o.door) {
        c.add({ kind: 'prismU', role: 'solid', fill: shade(palette.accent, -0.2), u0: o.u0 - 0.05, u1: o.u1 + 0.05, pts: [[o.z0 - 0.075, 0], [o.z0 - 0.075, R + cillP], [o.z0 - 0.02, R + cillP], [o.z0, R]] });
      }
    }
    // plinth and coping
    for (const r of c.solid({ x0: 0, x1: c.width, y0: 0, y1: plinthH }, 0.0)) {
      c.add({ kind: 'box', role: 'solid', fill: palette.accent, u: r.x0, z: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0, d0: 0, d1: R + 0.02 });
    }
    c.add({ kind: 'box', role: 'solid', fill: shade(palette.accent, -0.15), u: -cop, z: c.top - 0.075, w: c.width + 2 * cop, h: 0.075, d0: 0, d1: R + cop });
    // score lines at slab bands
    for (const b of c.bands) {
      if (b.kind !== 'floor') continue;
      for (const r of c.solid({ x0: 0, x1: c.width, y0: b.z1 - 0.005, y1: b.z1 + 0.005 }, 0)) {
        c.add({ kind: 'line', role: 'solid', fill: shade(palette.primary, 0.35), width: 0.008, pts: [[r.x0, b.z1, R + 0.001], [r.x1, b.z1, R + 0.001]] });
      }
    }
    c.row('Lime render, 3-coat', `${Math.round(R * 1000)} build-out`, palette.name, 1, area, 'm²');
    c.row('Splayed reveal', `${c.num('splay')}°`, 'Lime render on block', c.openings.length, 0);
    c.row('Cast stone cill', sz(R + cillP, 0.075), 'Cast stone', c.openings.filter((o) => !o.door).length, 0);
    c.row('Coping', sz(R + cop, 0.075), 'Cast stone', 1, 0, 'nr');
    return c.finish();
  },
};
