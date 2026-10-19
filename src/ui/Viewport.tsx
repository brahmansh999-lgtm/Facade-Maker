import { useMemo } from 'react';
import { useStore, type UIState, type ViewKind } from './store.ts';
import { useDerived } from './derived.ts';
import { SheetView } from './SheetView.tsx';
import { PlanEditor } from './PlanEditor.tsx';
import { AxoView, axoCanvas } from './AxoView.tsx';
import { ScheduleView } from './Schedule.tsx';
import { drawingFocus, renderCompare, renderSheet, sheetList } from '../drawings/sheets.ts';
import { SIDES } from '../geometry/faces.ts';
import type { Derived } from '../model/derive.ts';
import { exportPNG, slug } from '../export/export.ts';

export interface CurrentSheet { id: string; number: string; title: string; svg?: () => string }

export function currentSheet(d: Derived, ui: UIState): CurrentSheet {
  const list = sheetList(d);
  const find = (id: string) => list.find((s) => s.id === id)!;
  if (ui.view === 'elev') {
    if (ui.compare && ui.compareIds.length >= 2) return { id: 'compare', number: 'A-210', title: 'FACADE COMPARISON', svg: () => renderCompare(d, ui.elevSide, ui.compareIds) };
    const s = find(`elev-${ui.elevSide}`);
    return { id: s.id, number: s.number, title: s.title, svg: () => renderSheet(d, s.id) };
  }
  if (ui.view === 'plan') {
    const id = ui.planLevel === 'roof' ? 'roof' : `plan-${Math.min(ui.planLevel, d.levels.length - 1)}`;
    const s = find(id);
    return { id, number: s.number, title: s.title, svg: () => renderSheet(d, id) };
  }
  if (ui.view === 'section') { const s = find('section'); return { id: s.id, number: s.number, title: s.title, svg: () => renderSheet(d, 'section') }; }
  if (ui.view === 'axo') return { id: 'axo', number: 'A-401', title: 'AXONOMETRIC' };
  return { id: 'schedule', number: 'A-501', title: 'SCHEDULES' };
}

const TABS: { v: ViewKind; label: string; key: string }[] = [
  { v: 'elev', label: 'ELEVATIONS', key: 'E' }, { v: 'axo', label: 'AXO', key: 'A' }, { v: 'plan', label: 'PLANS', key: 'P' },
  { v: 'section', label: 'SECTION', key: 'S' }, { v: 'schedule', label: 'SCHEDULE', key: 'R' },
];

export function Viewport() {
  const d = useDerived();
  const ui = useStore((s) => s.ui);
  const setUI = useStore((s) => s.setUI);
  const cur = currentSheet(d, ui);
  const svg = useMemo(() => (cur.svg && ui.view !== 'plan' ? cur.svg() : ''), [d, ui.view, ui.elevSide, ui.compare, ui.compareIds, ui.planLevel]); // eslint-disable-line
  const levelsTabs: (number | 'roof')[] = [...d.levels.map((_, i) => i), 'roof'];
  const fitBtns = (
    <>
      <span className="sep" />
      <button onClick={() => setUI({ fitNonce: ui.fitNonce + 1 })} title="Frame the drawing (F)">FIT</button>
      <button onClick={() => setUI({ sheetNonce: ui.sheetNonce + 1 })} title="Show the whole A3 sheet">SHEET</button>
      <button onClick={() => setUI({ trueScaleNonce: ui.trueScaleNonce + 1 })} title="Sheet at true printed size on screen (1 mm = 1 mm)">TRUE SIZE</button>
    </>
  );
  let tools: React.ReactNode = null;
  let stage: React.ReactNode = null;
  if (ui.view === 'elev') {
    tools = (
      <>
        <span className="seg">
          {SIDES.map((s) => (
            <button key={s} className={ui.elevSide === s ? 'on' : ''} onClick={() => setUI({ elevSide: s })}>{d.faces[s].face.key} · {s.toUpperCase()}</button>
          ))}
        </span>
        <span className="sep" />
        <button className={ui.compare ? 'on' : ''} onClick={() => setUI({ compare: !ui.compare })} title="Compare 2–4 facades (C)">COMPARE</button>
        {ui.compare && <span className="dim">tick 2–4 in the catalogue · {ui.compareIds.length} selected</span>}
        {fitBtns}
        <span className="hint">wheel zoom · drag pan · 1–9/0 facade · [ ] cycle</span>
      </>
    );
    stage = ui.compare && ui.compareIds.length < 2
      ? <div className="empty">Select at least two facades in the catalogue to compare.</div>
      : <SheetView svg={svg} fitKey={cur.id} focus={drawingFocus(d, cur.id)} />;
  } else if (ui.view === 'plan') {
    tools = (
      <>
        <span className="seg">
          {levelsTabs.map((l) => (
            <button key={String(l)} className={ui.planLevel === l ? 'on' : ''} onClick={() => setUI({ planLevel: l, selRooms: [], selOpening: null })}>
              {l === 'roof' ? 'SITE / ROOF' : l === 0 ? 'GROUND' : `LEVEL ${l}`}
            </button>
          ))}
        </span>
        {ui.planLevel !== 'roof' && (
          <>
            <span className="sep" />
            <span className="seg">
              <button className={ui.tool === 'select' ? 'on' : ''} onClick={() => setUI({ tool: 'select' })}>SELECT / DRAG</button>
              <button className={ui.tool === 'split' ? 'on' : ''} onClick={() => setUI({ tool: 'split' })}>SPLIT</button>
              <button className={ui.tool === 'stair' ? 'on' : ''} onClick={() => setUI({ tool: 'stair' })}>MOVE STAIR</button>
            </span>
          </>
        )}
        {fitBtns}
        <span className="hint">{ui.tool === 'stair' ? 'click a room of the same footprint to swap the stair into' : ui.tool === 'split' ? 'click a room to halve it' : 'space/right-drag pan · shift-click to multi-select'}</span>
      </>
    );
    stage = ui.planLevel === 'roof' ? <SheetView svg={renderSheet(d, 'roof')} fitKey="roof" /> : <PlanEditor />;
  } else if (ui.view === 'section') {
    tools = <>{fitBtns}<span className="hint">section through the stair, along its run</span></>;
    stage = <SheetView svg={svg} fitKey="section" focus={drawingFocus(d, 'section')} />;
  } else if (ui.view === 'axo') {
    tools = (
      <>
        <button onClick={() => axoCanvas.reset?.()}>RESET VIEW</button>
        <button onClick={() => axoCanvas.current && exportPNG(`${slug(d.project.name)}-axo`, axoCanvas.current)}>PNG</button>
        <span className="hint">orthographic · drag orbit · right-drag pan · wheel zoom</span>
      </>
    );
    stage = <AxoView />;
  } else {
    tools = <span className="hint" style={{ marginLeft: 0 }}>facade components by elevation, totals, openings, rooms, stair — print from the title strip</span>;
    stage = <ScheduleView />;
  }
  return (
    <main className="vp">
      <div className="tools">{tools}</div>
      <div className="stage">{stage}</div>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.v} className={ui.view === t.v ? 'on' : ''} onClick={() => setUI({ view: t.v })}>{t.label}<span className="k">{t.key}</span></button>
        ))}
        <span className="status">{ui.status}</span>
      </nav>
    </main>
  );
}
