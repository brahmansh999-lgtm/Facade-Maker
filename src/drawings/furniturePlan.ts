// Furniture symbols in plan, drawn in each piece's own frame: a runs along its wall, b out from it.
import type { Furn } from '../geometry/furniture.ts';
import { W, type Painter, type View } from './painter.ts';

const LINE = '#6d6a63';
const TOP = '#f8f6f1';
const SOFT = '#ece8df';

export function drawFurniture(pt: Painter, v: View, items: Furn[]) {
  pt.begin('furniture');
  for (const f of items) drawPiece(pt, v, f);
  pt.end();
}

function drawPiece(pt: Painter, v: View, f: Furn) {
  const r = f.r;
  const ys = f.side[0] === 'y';
  const L = ys ? r.x1 - r.x0 : r.y1 - r.y0;       // along the wall
  const D = ys ? r.y1 - r.y0 : r.x1 - r.x0;       // out from the wall
  const P = (a: number, b: number): [number, number] => {
    switch (f.side) {
      case 'y0': return [v.X(r.x0 + a), v.Y(r.y0 + b)];
      case 'y1': return [v.X(r.x0 + a), v.Y(r.y1 - b)];
      case 'x0': return [v.X(r.x0 + b), v.Y(r.y0 + a)];
      case 'x1': return [v.X(r.x1 - b), v.Y(r.y0 + a)];
    }
  };
  const sw = W.THIN, s = { stroke: LINE, sw };
  const box = (a0: number, b0: number, a1: number, b1: number, fill?: string, dash?: number[]) =>
    pt.poly([P(a0, b0), P(a1, b0), P(a1, b1), P(a0, b1)].flat(), true, { ...s, fill, dash });
  const ln = (a0: number, b0: number, a1: number, b1: number) => { const p = P(a0, b0), q = P(a1, b1); pt.line(p[0], p[1], q[0], q[1], s); };
  const circ = (a: number, b: number, rad: number, fill?: string) => { const [x, y] = P(a, b); pt.circle(x, y, rad * v.k, { ...s, fill }); };
  const ell = (a: number, b: number, ra: number, rb: number, fill?: string) => {
    const [x, y] = P(a, b);
    const rx = (ys ? ra : rb) * v.k, ry = (ys ? rb : ra) * v.k;
    pt.path(`M ${(x - rx).toFixed(3)} ${y.toFixed(3)} A ${rx.toFixed(3)} ${ry.toFixed(3)} 0 1 0 ${(x + rx).toFixed(3)} ${y.toFixed(3)} A ${rx.toFixed(3)} ${ry.toFixed(3)} 0 1 0 ${(x - rx).toFixed(3)} ${y.toFixed(3)} Z`, { ...s, fill });
  };

  switch (f.kind) {
    case 'bed': {
      box(0, 0, L, D, TOP);
      box(0.03, 0, L - 0.03, 0.06, SOFT);                       // headboard
      const n = L > 1.1 ? 2 : 1, pw = (L - 0.2 - (n - 1) * 0.08) / n;
      for (let i = 0; i < n; i++) box(0.1 + i * (pw + 0.08), 0.12, 0.1 + i * (pw + 0.08) + pw, 0.42, '#fff');
      ln(0, 0.62, L, 0.62);                                      // duvet fold
      ln(L * 0.62, D, L, D - (L * 0.38));                        // turned-back corner
      break;
    }
    case 'bedside': box(0, 0, L, D, TOP); circ(L / 2, D / 2, 0.1); break;
    case 'wardrobe': {
      box(0, 0, L, D, TOP);
      pt.line(...P(0.05, D / 2), ...P(L - 0.05, D / 2), { ...s, dash: [0.8, 0.5] });
      const doors = Math.max(2, Math.round(L / 0.6));
      for (let i = 1; i < doors; i++) ln((L * i) / doors, D - 0.04, (L * i) / doors, D);
      break;
    }
    case 'sofa': case 'armchair': {
      box(0, 0, L, D, SOFT);
      const arm = f.kind === 'sofa' ? 0.2 : 0.15, back = 0.22;
      box(arm, back, L - arm, D - 0.04, TOP);
      ln(0, back, arm, back); ln(L - arm, back, L, back);
      if (f.kind === 'sofa') { const n = L > 2.1 ? 3 : 2; for (let i = 1; i < n; i++) ln(arm + ((L - 2 * arm) * i) / n, back, arm + ((L - 2 * arm) * i) / n, D - 0.04); }
      break;
    }
    case 'coffee': box(0, 0, L, D, TOP); box(0.06, 0.06, L - 0.06, D - 0.06); break;
    case 'rug': box(0, 0, L, D, undefined, [1.2, 0.7]); break;
    case 'tv': box(0, 0, L, D, TOP); box(L * 0.1, 0.06, L * 0.9, 0.12, '#3a3936'); break;
    case 'table': box(0, 0, L, D, TOP); break;
    case 'chair': box(0.02, 0, L - 0.02, D - 0.03, TOP); ln(0.02, 0.08, L - 0.02, 0.08); break;
    case 'counter': {
      box(0, 0, L, D, TOP);
      ln(0, D - 0.04, L, D - 0.04);
      if (L >= 1.4) {
        const sa = Math.min(L - 0.45, Math.max(0.45, L * 0.3));
        box(sa - 0.35, 0.1, sa + 0.35, 0.5, '#fff'); circ(sa, 0.3, 0.025);       // sink
        const ha = L * 0.72;
        if (ha + 0.35 < L && ha - 0.35 > sa + 0.4) for (const [da, db] of [[-0.15, 0.18], [0.15, 0.18], [-0.15, 0.42], [0.15, 0.42]]) circ(ha + da, db, 0.08);
      }
      break;
    }
    case 'worktop': box(0, 0, L, D, TOP); ln(0, D - 0.04, L, D - 0.04); break;
    case 'fridge': box(0, 0, L, D, TOP); ln(0.05, D - 0.06, L - 0.05, D - 0.06); ln(0, 0, L, D); break;
    case 'desk': box(0, 0, L, D, TOP); box(L / 2 - 0.23, D + 0.08, L / 2 + 0.23, D + 0.52, TOP); ln(L / 2 - 0.23, D + 0.46, L / 2 + 0.23, D + 0.46); break;
    case 'shelf': { box(0, 0, L, D, TOP); const n = Math.max(1, Math.round(L / 0.8)); for (let i = 1; i < n; i++) ln((L * i) / n, 0, (L * i) / n, D); ln(0, 0, L, D); break; }
    case 'wc': box(0.02, 0, L - 0.02, 0.2, TOP); ell(L / 2, 0.44, 0.19, 0.25, '#fff'); break;
    case 'basin': box(0, 0, L, D, TOP); ell(L / 2, D * 0.5, L * 0.32, D * 0.32, '#fff'); circ(L / 2, D * 0.5, 0.02); break;
    case 'shower': box(0, 0, L, D, '#eef1f0'); ln(0, 0, L, D); ln(L, 0, 0, D); circ(L / 2, D / 2, 0.05, '#fff'); break;
    case 'washer': box(0, 0, L, D, TOP); circ(L / 2, D / 2 + 0.02, 0.2); break;
    case 'console': box(0, 0, L, D, TOP); break;
    case 'plant': circ(L / 2, D / 2, Math.min(L, D) / 2, '#e3e6dc'); circ(L / 2, D / 2, Math.min(L, D) / 4); break;
  }
}
