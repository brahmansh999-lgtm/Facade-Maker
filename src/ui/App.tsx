import { useEffect, useMemo } from 'react';
import { useStore } from './store.ts';
import { DerivedCtx } from './derived.ts';
import { derive } from '../model/derive.ts';
import { TitleStrip } from './TitleStrip.tsx';
import { Rail } from './Rail.tsx';
import { Viewport } from './Viewport.tsx';
import { Inspector } from './Inspector.tsx';
import { FACADES } from '../facades/registry.ts';

export function App() {
  const project = useStore((s) => s.project);
  const d = useMemo(() => derive(project), [project]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      const s = useStore.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) s.redo(); else s.undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); s.redo(); return; }
      if (mod || e.altKey) return;
      const setActive = (i: number) => {
        const t = FACADES[(i + FACADES.length) % FACADES.length];
        s.commit((p) => ({ ...p, facade: { ...p.facade, activeTypeId: t.id } }));
        s.setUI({ status: `Facade ${String(t.num).padStart(2, '0')} — ${t.name}` });
      };
      const cur = FACADES.findIndex((f) => f.id === s.project.facade.activeTypeId);
      // 1–9, 0 → facades 01–10; shift+1–5 → 11–15
      const digit = /^Digit(\d)$/.exec(e.code);
      if (digit) {
        const n = Number(digit[1]);
        const idx = e.shiftKey ? (n >= 1 && n <= 5 ? 9 + n : -1) : n === 0 ? 9 : n - 1;
        if (idx >= 0) { setActive(idx); e.preventDefault(); }
        return;
      }
      switch (e.key) {
        case '[': setActive(cur - 1); break;
        case ']': setActive(cur + 1); break;
        case 'e': case 'E': s.setUI({ view: 'elev' }); break;
        case 'a': case 'A': s.setUI({ view: 'axo' }); break;
        case 'p': case 'P': s.setUI({ view: 'plan' }); break;
        case 's': case 'S': s.setUI({ view: 'section' }); break;
        case 'r': case 'R': s.setUI({ view: 'schedule' }); break;
        case 'c': case 'C': s.setUI({ view: 'elev', compare: !s.ui.compare }); break;
        case 'f': case 'F': s.setUI({ fitNonce: s.ui.fitNonce + 1 }); break;
        case 'Escape': s.setUI({ selRooms: [], selOpening: null, tool: 'select' }); break;
        default: return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <DerivedCtx.Provider value={d}>
      <div className="app">
        <TitleStrip />
        <Rail />
        <Viewport />
        <Inspector />
      </div>
    </DerivedCtx.Provider>
  );
}
