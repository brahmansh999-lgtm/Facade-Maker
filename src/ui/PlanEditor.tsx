// Plan editor: the drawn plan sheet with an interactive overlay in the same sheet coordinates.
import { useMemo, useRef, useState } from 'react';
import { useStore } from './store.ts';
import { useDerived } from './derived.ts';
import { SheetView, toSheet } from './SheetView.tsx';
import { drawingFocus, renderSheet } from '../drawings/sheets.ts';
import { planLayout } from '../drawings/plan.ts';
import { moveEdge, snapCoord, splitRoom, swapStair, type Edge } from '../model/edit.ts';
import { roomRect } from '../geometry/rect.ts';

const ACCENT = '#a33b20';

export function PlanEditor() {
  const d = useDerived();
  const ui = useStore((s) => s.ui);
  const commit = useStore((s) => s.commit);
  const setUI = useStore((s) => s.setUI);
  const li = typeof ui.planLevel === 'number' ? Math.min(ui.planLevel, d.levels.length - 1) : 0;
  const svgRef = useRef<SVGSVGElement>(null);
  const svg = useMemo(() => renderSheet(d, `plan-${li}`), [d, li]);
  const { view: v } = useMemo(() => planLayout(d), [d]);
  const L = d.levels[li];
  const [drag, setDrag] = useState<{ roomId: string; edge: Edge; key: string; label: string; at: [number, number] } | null>(null);

  const startEdge = (e: React.PointerEvent, roomId: string, edge: Edge) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const key = `edge-${Date.now()}`;
    const svgEl = svgRef.current!;
    const axis = edge[0] as 'x' | 'y';
    const move = (ev: PointerEvent) => {
      const [sx, sy] = toSheet(svgEl, ev.clientX, ev.clientY);
      const m = axis === 'x' ? (sx - v.ox) / v.k : (v.oy - sy) / v.k;
      const p = useStore.getState().project;
      const t = snapCoord(p, axis, m);
      commit((pp) => moveEdge(pp, li, roomId, edge, t), key);
      const r = useStore.getState().project.levels[li].rooms.find((x) => x.id === roomId);
      if (r) {
        const b = roomRect(r);
        setDrag({ roomId, edge, key, label: `${(b.x1 - b.x0).toFixed(2)} × ${(b.y1 - b.y0).toFixed(2)}`, at: [sx, sy] });
      }
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setDrag(null); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const clickRoom = (e: React.PointerEvent, roomId: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (ui.tool === 'split') { commit((p) => splitRoom(p, li, roomId)); setUI({ selRooms: [roomId], selOpening: null }); return; }
    if (ui.tool === 'stair') {
      const r = swapStair(useStore.getState().project, li, roomId);
      if (r.error) setUI({ status: r.error });
      else { commit(() => r.project); setUI({ status: 'Stair moved — enclosure re-checked', tool: 'select' }); }
      return;
    }
    const sel = e.shiftKey ? (ui.selRooms.includes(roomId) ? ui.selRooms.filter((x) => x !== roomId) : [...ui.selRooms, roomId].slice(-2)) : [roomId];
    setUI({ selRooms: sel, selOpening: null });
  };

  const X = (x: number) => v.X(x), Y = (y: number) => v.Y(y);
  const one = ui.selRooms.length === 1 ? L.level.rooms.find((r) => r.id === ui.selRooms[0]) : undefined;
  const overlay = (
    <g>
      {L.level.rooms.map((r) => {
        const b = roomRect(r);
        const sel = ui.selRooms.includes(r.id);
        return (
          <rect key={r.id} x={X(b.x0)} y={Y(b.y1)} width={(b.x1 - b.x0) * v.k} height={(b.y1 - b.y0) * v.k}
            fill={sel ? 'rgba(163,59,32,0.07)' : 'transparent'} stroke={sel ? ACCENT : 'none'} strokeWidth={0.45}
            style={{ cursor: ui.tool === 'select' ? 'pointer' : 'crosshair' }} onPointerDown={(e) => clickRoom(e, r.id)} />
        );
      })}
      {L.openings.map((o) => {
        const p = o.run === 'x' ? [o.center, o.c] : [o.c, o.center];
        const sel = ui.selOpening === o.id;
        return (
          <g key={o.id} style={{ cursor: 'pointer' }} onPointerDown={(e) => { if (e.button) return; e.stopPropagation(); setUI({ selOpening: o.id, selRooms: [] }); }}>
            <circle cx={X(p[0])} cy={Y(p[1])} r={1.6} fill="transparent" />
            <circle cx={X(p[0])} cy={Y(p[1])} r={sel ? 1.0 : 0.55} fill={sel ? ACCENT : o.overridden ? '#1b1a17' : 'transparent'} stroke={ACCENT} strokeWidth={0.25} />
          </g>
        );
      })}
      {one && one.type !== 'stair' && ui.tool === 'select' && (() => {
        const b = roomRect(one);
        const hz = 1.6;
        const edges: { e: Edge; x: number; y: number; w: number; h: number; cur: string }[] = [
          { e: 'x0', x: X(b.x0) - hz / 2, y: Y(b.y1), w: hz, h: (b.y1 - b.y0) * v.k, cur: 'ew-resize' },
          { e: 'x1', x: X(b.x1) - hz / 2, y: Y(b.y1), w: hz, h: (b.y1 - b.y0) * v.k, cur: 'ew-resize' },
          { e: 'y0', x: X(b.x0), y: Y(b.y0) - hz / 2, w: (b.x1 - b.x0) * v.k, h: hz, cur: 'ns-resize' },
          { e: 'y1', x: X(b.x0), y: Y(b.y1) - hz / 2, w: (b.x1 - b.x0) * v.k, h: hz, cur: 'ns-resize' },
        ];
        return edges.map((g) => (
          <g key={g.e}>
            <rect x={g.x} y={g.y} width={g.w} height={g.h} fill="transparent" style={{ cursor: g.cur }} onPointerDown={(e) => startEdge(e, one.id, g.e)} />
            <rect x={g.x + g.w / 2 - 0.9} y={g.y + g.h / 2 - 0.9} width={1.8} height={1.8} fill="#f2efe8" stroke={ACCENT} strokeWidth={0.3} pointerEvents="none" />
          </g>
        ));
      })()}
      {drag && (
        <g pointerEvents="none">
          <rect x={drag.at[0] + 3} y={drag.at[1] - 6} width={26} height={4.4} fill="#1b1a17" />
          <text x={drag.at[0] + 4} y={drag.at[1] - 2.8} fontSize={2.4} fill="#f2efe8" fontFamily="IBM Plex Mono, monospace">{drag.label}</text>
        </g>
      )}
    </g>
  );
  return <SheetView svg={svg} fitKey={`plan-${li}`} focus={drawingFocus(d, `plan-${li}`)} overlay={overlay} panWithLeft={false} svgRef={svgRef} />;
}
