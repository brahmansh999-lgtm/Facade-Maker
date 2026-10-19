import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useStore } from './store.ts';
import { A3 } from '../drawings/sheet.ts';

interface Props {
  svg: string;
  /** refit when this changes (e.g. a different sheet) */
  fitKey: string;
  overlay?: ReactNode;
  /** left-drag pans (off in the plan editor, where left-drag edits) */
  panWithLeft?: boolean;
  svgRef?: RefObject<SVGSVGElement | null>;
  /** sheet-mm rect of the drawing itself; FIT frames this instead of the whole sheet */
  focus?: { x: number; y: number; w: number; h: number };
}

const PX_PER_MM = 96 / 25.4;

export function SheetView({ svg, fitKey, overlay, panWithLeft = true, svgRef, focus }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const ownRef = useRef<SVGSVGElement>(null);
  const ref = svgRef ?? ownRef;
  const [vb, setVb] = useState({ x: 0, y: 0, w: A3.w, h: A3.h });
  const fitNonce = useStore((s) => s.ui.fitNonce);
  const sheetNonce = useStore((s) => s.ui.sheetNonce);
  const trueNonce = useStore((s) => s.ui.trueScaleNonce);
  const inner = useMemo(() => svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, ''), [svg]);

  const fitTo = (t: { x: number; y: number; w: number; h: number }) => {
    const el = host.current;
    if (!el) return;
    const cw = el.clientWidth || 1, ch = el.clientHeight || 1;
    const s = Math.min(cw / t.w, ch / t.h) * 0.97;
    const w = cw / s, h = ch / s;
    setVb({ x: t.x + (t.w - w) / 2, y: t.y + (t.h - h) / 2, w, h });
  };
  const sheet = { x: 0, y: 0, w: A3.w, h: A3.h };
  useLayoutEffect(() => fitTo(focus ?? sheet), [fitKey, fitNonce]); // eslint-disable-line
  useLayoutEffect(() => { if (sheetNonce) fitTo(sheet); }, [sheetNonce]); // eslint-disable-line
  useEffect(() => {
    if (!trueNonce) return;
    const el = host.current;
    if (!el) return;
    setVb((v) => {
      const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
      const w = el.clientWidth / PX_PER_MM, h = el.clientHeight / PX_PER_MM;
      return { x: cx - w / 2, y: cy - h / 2, w, h };
    });
  }, [trueNonce]);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setVb((v) => {
        const s = el.clientWidth / v.w;
        if (!isFinite(s) || s <= 0) return v;
        return { ...v, h: el.clientHeight / s };
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // wheel zoom about the cursor (native listener: React's is passive)
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
      const f = Math.pow(1.0018, e.deltaY);
      setVb((v) => {
        const w = Math.min(A3.w * 6, Math.max(8, v.w * f));
        const h = (v.h / v.w) * w;
        return { x: v.x + (v.w - w) * fx, y: v.y + (v.h - h) * fy, w, h };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const pan = useRef<{ x: number; y: number } | null>(null);
  const space = useRef(false);
  useEffect(() => {
    const kd = (e: KeyboardEvent) => { if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) space.current = true; };
    const ku = (e: KeyboardEvent) => { if (e.code === 'Space') space.current = false; };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    const wantPan = e.button === 1 || e.button === 2 || space.current || (e.button === 0 && panWithLeft);
    if (!wantPan) return;
    e.preventDefault();
    pan.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pan.current || !host.current) return;
    const s = host.current.clientWidth / vb.w;
    const dx = (e.clientX - pan.current.x) / s, dy = (e.clientY - pan.current.y) / s;
    pan.current = { x: e.clientX, y: e.clientY };
    setVb((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
  };
  const onPointerUp = () => { pan.current = null; };

  return (
    <div className="sheetwrap" ref={host} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onContextMenu={(e) => e.preventDefault()} style={{ cursor: pan.current ? 'grabbing' : panWithLeft ? 'grab' : 'default' }}>
      <svg className="sheet" ref={ref} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet">
        <rect x={-2000} y={-2000} width={4420} height={4297} fill="#e3dfd4" />
        <rect x={1.2} y={1.6} width={A3.w} height={A3.h} fill="#cfcabd" />
        <g dangerouslySetInnerHTML={{ __html: inner }} />
        {overlay}
      </svg>
    </div>
  );
}

/** client → sheet mm */
export function toSheet(svg: SVGSVGElement, clientX: number, clientY: number): [number, number] {
  const m = svg.getScreenCTM();
  if (!m) return [0, 0];
  const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
  return [p.x, p.y];
}
