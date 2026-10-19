import { useDerived } from './derived.ts';
import type { Derived } from '../model/derive.ts';
import { SIDES, FACE_NAME } from '../geometry/faces.ts';
import { fnum } from '../facades/registry.ts';
import type { ScheduleRow } from '../facades/types.ts';
import { area, rw, rh } from '../geometry/rect.ts';
import { HABITABLE } from '../geometry/openings.ts';

const n2 = (v: number) => v.toFixed(2);
const fmtCount = (r: ScheduleRow) => (r.unit === 'nr' ? String(Math.round(r.count)) : r.count.toFixed(1));

function totals(d: Derived): ScheduleRow[] {
  const m = new Map<string, ScheduleRow>();
  for (const s of SIDES) for (const r of d.faces[s].out.schedule) {
    const k = `${r.element}|${r.size}|${r.material}|${r.unit}`;
    const e = m.get(k);
    if (e) { e.count += r.count; e.area += r.area; } else m.set(k, { ...r });
  }
  return [...m.values()];
}

export function ScheduleTables({ d }: { d: Derived }) {
  const p = d.project;
  const st = d.stair;
  return (
    <>
      <div className="sc" style={{ fontSize: 15 }}>Schedules — {p.name}</div>
      <div className="mono dim">Built-up {n2(d.builtUp)} m² · {p.levels.length} floors · footprint {n2(d.outer.x1 - d.outer.x0)} × {n2(d.outer.y1 - d.outer.y0)} m</div>

      <h3 className="sc">Facade component schedule — by elevation</h3>
      <table>
        <thead><tr><th>ELEV.</th><th>TYPE</th><th>ELEMENT</th><th>SIZE (mm)</th><th>MATERIAL</th><th className="n">QTY</th><th>UNIT</th><th className="n">AREA m²</th></tr></thead>
        <tbody>
          {SIDES.map((s) => {
            const f = d.faces[s];
            return f.out.schedule.map((r, i) => (
              <tr key={s + i} className={i === f.out.schedule.length - 1 ? 'sub' : ''}>
                <td className="mono">{i === 0 ? `${f.face.key} · ${s.toUpperCase()}` : ''}</td>
                <td>{i === 0 ? `${fnum(f.type.num)} ${f.type.name}` : ''}</td>
                <td>{r.element}</td><td className="mono">{r.size}</td><td>{r.material}</td>
                <td className="n">{fmtCount(r)}</td><td className="mono">{r.unit}</td><td className="n">{r.area ? n2(r.area) : ''}</td>
              </tr>
            ));
          })}
        </tbody>
      </table>
      <h3 className="sc">Facade totals</h3>
      <table>
        <thead><tr><th>ELEMENT</th><th>SIZE (mm)</th><th>MATERIAL</th><th className="n">QTY</th><th>UNIT</th><th className="n">AREA m²</th></tr></thead>
        <tbody>{totals(d).map((r, i) => <tr key={i}><td>{r.element}</td><td className="mono">{r.size}</td><td>{r.material}</td><td className="n">{fmtCount(r)}</td><td className="mono">{r.unit}</td><td className="n">{r.area ? n2(r.area) : ''}</td></tr>)}</tbody>
      </table>

      <h3 className="sc">Facade checks against openings</h3>
      <table>
        <thead><tr><th>ELEV.</th><th>TYPE</th><th className="n">OPENINGS</th><th>RESULT</th><th>NOTES</th></tr></thead>
        <tbody>{SIDES.map((s) => {
          const f = d.faces[s];
          return <tr key={s}><td className="mono">{f.face.key}</td><td>{f.type.name}</td><td className="n">{f.face.openings.length}</td>
            <td className={f.issues.length ? 'accent' : ''}>{f.issues.length ? f.issues.map((i) => i.detail).join('; ') : 'Clear — no element over any opening; screens pass required free area'}</td>
            <td className="dim">{f.out.notes.join(' ')}</td></tr>;
        })}</tbody>
      </table>

      <h3 className="sc">Window & door schedule</h3>
      <table>
        <thead><tr><th>TAG</th><th>LEVEL</th><th>ROOM</th><th>TYPE</th><th>FACE</th><th className="n">W</th><th className="n">SILL</th><th className="n">HEAD</th><th className="n">GLAZED m²</th><th className="n">VENT m²</th><th className="n">SCREEN ≥</th><th>SRC</th></tr></thead>
        <tbody>{d.levels.flatMap((L) => L.openings.filter((o) => o.kind !== 'opening').map((o) => {
          const room = L.level.rooms.find((r) => r.id === o.roomId);
          const face = o.side ? d.faces[o.side].face.key : '—';
          return <tr key={o.id}><td className="mono">{o.tag}</td><td className="mono">L{L.level.index}</td><td>{room?.name}</td><td>{o.kind}</td><td className="mono">{face}</td>
            <td className="n">{Math.round(o.width * 1000)}</td><td className="n">{Math.round(o.sill * 1000)}</td><td className="n">{Math.round(o.head * 1000)}</td>
            <td className="n">{o.glazedArea ? n2(o.glazedArea) : ''}</td><td className="n">{o.ventArea ? n2(o.ventArea) : ''}</td>
            <td className="n">{o.external && (o.kind === 'window' || o.kind === 'ventilator') ? `${Math.round(o.reqRatio * 100)}%` : ''}</td>
            <td className="mono dim">{o.overridden ? 'OVR' : 'DER'}</td></tr>;
        }))}</tbody>
      </table>

      <h3 className="sc">Room schedule</h3>
      <table>
        <thead><tr><th>LEVEL</th><th>ROOM</th><th>TYPE</th><th className="n">CLEAR W × D</th><th className="n">AREA m²</th><th className="n">GLAZING REQ / PROV</th><th className="n">VENT REQ / PROV</th></tr></thead>
        <tbody>{d.levels.flatMap((L) => L.level.rooms.map((r) => {
          const c = L.clear.get(r.id)!;
          const A = area(c);
          const hab = HABITABLE.includes(r.type);
          const g = L.openings.filter((o) => o.roomId === r.id).reduce((s, o) => s + o.glazedArea, 0);
          const v = L.openings.filter((o) => o.roomId === r.id).reduce((s, o) => s + o.ventArea, 0);
          return <tr key={r.id}><td className="mono">L{L.level.index}</td><td>{r.name}</td><td className="dim">{r.type}</td>
            <td className="n">{n2(rw(c))} × {n2(rh(c))}</td><td className="n">{n2(A)}</td>
            <td className="n">{hab ? `${n2(A / 10)} / ${n2(g)}` : ''}</td><td className="n">{hab ? `${n2(A / 20)} / ${n2(v)}` : ''}</td></tr>;
        }))}</tbody>
      </table>

      <h3 className="sc">Stair</h3>
      <table><tbody>
        <tr><td>Type</td><td className="mono">{st.type}</td><td>Risers</td><td className="mono">{st.n} @ {Math.round(st.R * 1000)} mm (≤ 175)</td></tr>
        <tr><td>Tread</td><td className="mono">{Math.round(st.T * 1000)} mm (≥ 250)</td><td>2R + T</td><td className="mono">{Math.round(st.twoRT * 1000)} mm (600–640)</td></tr>
        <tr><td>Flight width</td><td className="mono">{Math.round(st.width * 1000)} mm</td><td>Landing depth</td><td className="mono">{Math.round(st.landing * 1000)} mm (≥ width)</td></tr>
        <tr><td>Headroom</td><td className="mono">{n2(st.headroom)} m (≥ 2.10)</td><td>Enclosure</td><td className="mono">{n2(st.short)} × {n2(st.long)} m, needs {n2(st.requiredWidth)} × {n2(st.requiredLength)}</td></tr>
      </tbody></table>
      <h3 className="sc">Elevation faces</h3>
      <table><tbody>{SIDES.map((s) => { const f = d.faces[s]; return <tr key={s}><td className="mono">{f.face.key}</td><td>{FACE_NAME[f.face.key]} ({s})</td><td className="mono">bearing {Math.round(f.face.bearing)}°</td><td className="mono">exposure {Math.round(f.orient.exposure * 100)}%</td><td className="mono">cut-off {Math.round(f.orient.cutoff)}°</td><td>{f.type.name}{f.overridden ? ' (override)' : ''}</td></tr>; })}</tbody></table>
    </>
  );
}

export function ScheduleView() {
  const d = useDerived();
  return <div className="sched" id="schedule-html"><ScheduleTables d={d} /></div>;
}
