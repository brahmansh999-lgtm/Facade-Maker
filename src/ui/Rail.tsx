// Facade catalogue: a live mini elevation of THIS house in each facade type.
import { useEffect, useRef } from 'react';
import { useStore } from './store.ts';
import { useDerived } from './derived.ts';
import { FACADES, defaultParams, fnum, getFacade } from '../facades/registry.ts';
import type { FacadeType } from '../facades/types.ts';
import { CanvasPainter, View } from '../drawings/painter.ts';
import { drawElevation } from '../drawings/elevation.ts';
import { orientationFor, runFacade, type Derived } from '../model/derive.ts';
import { PAPER } from '../drawings/color.ts';

function drawThumb(canvas: HTMLCanvasElement, d: Derived, t: FacadeType) {
  const side = useStore.getState().ui.elevSide;
  const f = d.faces[side].face;
  const p = d.project;
  const params = p.facade.typeParams[t.id] ?? defaultParams(t);
  const pal = t.palettes[p.facade.typePalette[t.id] ?? 0];
  const out = runFacade(t, f, orientationFor(p, f, d.sun[side]), params, pal);
  const dpr = window.devicePixelRatio || 1;
  const cw = canvas.clientWidth, ch = canvas.clientHeight;
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // drawing in sheet mm at 1:100, scaled to fit
  const k = 10;
  const topZ = Math.max(f.parapetTop, f.mumty?.z1 ?? 0);
  const wmm = (f.width + 1.2) * k, hmm = (topZ + 0.5) * k;
  const px = Math.min(canvas.width / wmm, canvas.height / hmm);
  const pt = new CanvasPainter(ctx, px);
  const ox = (canvas.width / px - f.width * k) / 2;
  const oy = canvas.height / px - (canvas.height / px - hmm) / 2 - 0.25 * k;
  drawElevation(pt, d, side, new View(ox, oy, k), { prims: out.prims, simple: true, dims: false, datums: false, grid: false });
}

export function Rail() {
  const d = useDerived();
  const ui = useStore((s) => s.ui);
  const active = useStore((s) => s.project.facade.activeTypeId);
  const commit = useStore((s) => s.commit);
  const setUI = useStore((s) => s.setUI);
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    FACADES.forEach((t, i) => {
      timers.push(setTimeout(() => {
        const c = canvases.current[i];
        if (!cancelled && c) drawThumb(c, d, t);
      }, 20 + i * 12));
    });
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [d, ui.elevSide]);

  const pick = (id: string) => {
    if (ui.compare) {
      const has = ui.compareIds.includes(id);
      const next = has ? ui.compareIds.filter((x) => x !== id) : [...ui.compareIds, id].slice(-4);
      setUI({ compareIds: next });
      return;
    }
    if (ui.scope !== 'all') {
      const k = ui.scope;
      commit((p) => {
        const pe = p.facade.perElevation[k];
        const t = getFacade(id);
        return { ...p, facade: { ...p.facade, perElevation: { ...p.facade.perElevation, [k]: { override: true, typeId: id, params: pe.typeId === id ? pe.params : { ...(p.facade.typeParams[id] ?? defaultParams(t)) }, palette: pe.typeId === id ? pe.palette : p.facade.typePalette[id] ?? 0 } } } };
      });
      return;
    }
    commit((p) => ({ ...p, facade: { ...p.facade, activeTypeId: id } }));
  };

  const selected = (id: string) => ui.compare ? ui.compareIds.includes(id) : ui.scope !== 'all' && d.project.facade.perElevation[ui.scope].override ? d.project.facade.perElevation[ui.scope].typeId === id : active === id;

  return (
    <aside className="rail">
      <h2><span className="sc">Facade catalogue</span><span className="mono dim">{ui.compare ? `${ui.compareIds.length}/4` : `${d.faces[ui.elevSide].face.key} ELEV.`}</span></h2>
      {FACADES.map((t, i) => (
        <div key={t.id} className={'entry' + (selected(t.id) ? ' sel' : '')} onClick={() => pick(t.id)} title={t.description}>
          <div className="num">{fnum(t.num)}</div>
          <div>
            <div className="name">
              <span>{t.name}</span>
              {ui.compare && <input type="checkbox" className="cmp" readOnly checked={ui.compareIds.includes(t.id)} />}
            </div>
            <canvas ref={(el) => { canvases.current[i] = el; }} />
          </div>
        </div>
      ))}
    </aside>
  );
}
