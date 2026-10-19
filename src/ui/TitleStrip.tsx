import { useRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useStore } from './store.ts';
import { useDerived } from './derived.ts';
import { currentSheet } from './Viewport.tsx';
import { ScheduleTables } from './Schedule.tsx';
import { renderSheet, sheetList, renderCompare } from '../drawings/sheets.ts';
import { todayText } from '../drawings/sheet.ts';
import { exportJSON, exportSVG, importJSON, printPages, slug } from '../export/export.ts';
import { fnum } from '../facades/registry.ts';
import { planLayout } from '../drawings/plan.ts';
import { elevLayout } from '../drawings/sheets.ts';
import { sectionLayout } from '../drawings/section.ts';
import { roofLayout } from '../drawings/roof.ts';

export function TitleStrip() {
  const d = useDerived();
  const ui = useStore((s) => s.ui);
  const commit = useStore((s) => s.commit);
  const replace = useStore((s) => s.replace);
  const setUI = useStore((s) => s.setUI);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const file = useRef<HTMLInputElement>(null);
  const cur = currentSheet(d, ui);
  const p = d.project;
  const scale = ui.view === 'plan' ? (ui.planLevel === 'roof' ? roofLayout(d).scale : planLayout(d).scale)
    : ui.view === 'elev' ? elevLayout(d, ui.elevSide).scale : ui.view === 'section' ? sectionLayout(d).scale : null;
  const active = d.faces[ui.elevSide];

  const svgOut = () => {
    if (!cur.svg) { setUI({ status: 'This view has no SVG sheet — use PNG (axo) or print (schedule).' }); return; }
    exportSVG(`${slug(p.name)}-${cur.number}`, cur.svg());
  };
  const printCurrent = () => {
    if (cur.id === 'schedule') printPages([], [renderToStaticMarkup(<ScheduleTables d={d} />)]);
    else if (cur.svg) printPages([cur.svg()]);
  };
  const printSet = () => {
    const sheets = sheetList(d).map((s) => renderSheet(d, s.id));
    if (ui.compareIds.length >= 2) sheets.push(renderCompare(d, ui.elevSide, ui.compareIds));
    printPages(sheets, [renderToStaticMarkup(<ScheduleTables d={d} />)]);
  };

  return (
    <header className="strip">
      <div className="cell proj"><label>PROJECT</label><input type="text" value={p.name} onChange={(e) => commit((pp) => ({ ...pp, name: e.target.value }), 'name')} /></div>
      <div className="cell" style={{ minWidth: 70 }}><label>SHEET</label><span className="v mono">{cur.number}</span></div>
      <div className="cell grow"><label>DRAWING</label><span className="v">{cur.title}{ui.view === 'elev' && !ui.compare ? ` — ${fnum(active.type.num)} ${active.type.name}` : ''}</span></div>
      <div className="cell hide-sm" style={{ minWidth: 92 }}><label>SCALE</label><span className="v mono">{scale ? `1:${scale} @ A3` : '—'}</span></div>
      <div className="cell hide-sm" style={{ minWidth: 84 }}><label>DATE</label><span className="v mono">{todayText()}</span></div>
      <div className="cell acts">
        <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl/⌘ Z)">UNDO</button>
        <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl/⌘ ⇧ Z)">REDO</button>
        <button onClick={svgOut} title="Download this sheet as SVG">SVG</button>
        <button onClick={printCurrent} title="Print / save this sheet as PDF (A3)">PRINT</button>
        <button onClick={printSet} title="Print the whole drawing set">SET</button>
        <button onClick={() => exportJSON(p)} title="Save project JSON">JSON ↓</button>
        <button onClick={() => file.current?.click()} title="Open project JSON">OPEN</button>
        <input ref={file} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try { replace(await importJSON(f)); setUI({ status: `Opened ${f.name}` }); } catch (err) { setUI({ status: (err as Error).message }); }
        }} />
      </div>
    </header>
  );
}
