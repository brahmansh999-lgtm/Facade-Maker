import { useState } from 'react';
import { useStore } from './store.ts';
import { useDerived } from './derived.ts';
import { defaultParams, fnum, getFacade, FACADES } from '../facades/registry.ts';
import type { ParamDef } from '../facades/types.ts';
import type { Brief, FaceKey, ParamSet, ParamValue, Project, RoomType, Site } from '../model/types.ts';
import { relayout } from '../model/defaults.ts';
import { ROOM_LABEL, canMerge, mergeRooms, setOverride, setRoom } from '../model/edit.ts';
import { SIDES, FACE_NAME } from '../geometry/faces.ts';
import { area, rw, rh } from '../geometry/rect.ts';

const KEYS: FaceKey[] = ['N', 'E', 'S', 'W'];

function Stepper({ value, step, min, max, fmt, onChange }: { value: number; step: number; min: number; max: number; fmt?: (n: number) => string; onChange: (n: number) => void }) {
  const set = (n: number) => onChange(Math.round(Math.min(max, Math.max(min, n)) * 1000) / 1000);
  return (
    <span className="stepper">
      <button onClick={() => set(value - step)} disabled={value <= min}>−</button>
      <span className="n mono">{fmt ? fmt(value) : value}</span>
      <button onClick={() => set(value + step)} disabled={value >= max}>+</button>
    </span>
  );
}

function Param({ def, value, onChange }: { def: ParamDef; value: ParamValue; onChange: (v: ParamValue, done?: boolean) => void }) {
  if (def.kind === 'select') {
    return (
      <div className="row inline">
        <span className="lab">{def.label}</span>
        <select value={String(value)} onChange={(e) => onChange(e.target.value, true)}>
          {def.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    );
  }
  if (def.kind === 'toggle') {
    return (
      <div className="row inline">
        <span className="lab">{def.label}</span>
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked, true)} />
      </div>
    );
  }
  return (
    <div className="row">
      <span className="lab">{def.label}</span>
      <span className="val mono">{String(value)}<span className="dim"> {def.unit}</span></span>
      <input className="ctl" type="range" min={def.min} max={def.max} step={def.step} value={Number(value)} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

export function Inspector() {
  const d = useDerived();
  const p = d.project;
  const ui = useStore((s) => s.ui);
  const commit = useStore((s) => s.commit);
  const setUI = useStore((s) => s.setUI);
  const [warnOpen, setWarnOpen] = useState(true);

  // ---- which facade are we editing?
  const scopeKey = ui.scope;
  const pe = scopeKey === 'all' ? null : p.facade.perElevation[scopeKey];
  const editingOverride = !!pe?.override;
  const type = getFacade(editingOverride ? pe!.typeId : p.facade.activeTypeId);
  const params: ParamSet = editingOverride ? pe!.params : p.facade.typeParams[type.id] ?? defaultParams(type);
  const palIdx = editingOverride ? pe!.palette : p.facade.typePalette[type.id] ?? 0;
  const sideOfScope = scopeKey === 'all' ? ui.elevSide : SIDES.find((s) => d.faces[s].face.key === scopeKey) ?? ui.elevSide;
  const fdScope = d.faces[sideOfScope];

  const setParam = (key: string, v: ParamValue, done?: boolean) => {
    const merge = done ? undefined : `param:${scopeKey}:${type.id}:${key}`;
    commit((pp) => {
      const f = pp.facade;
      if (editingOverride) {
        const e = f.perElevation[scopeKey as FaceKey];
        return { ...pp, facade: { ...f, perElevation: { ...f.perElevation, [scopeKey]: { ...e, params: { ...e.params, [key]: v } } } } };
      }
      return { ...pp, facade: { ...f, typeParams: { ...f.typeParams, [type.id]: { ...(f.typeParams[type.id] ?? {}), [key]: v } } } };
    }, merge);
  };
  const setPalette = (i: number) => commit((pp) => {
    const f = pp.facade;
    if (editingOverride) return { ...pp, facade: { ...f, perElevation: { ...f.perElevation, [scopeKey]: { ...f.perElevation[scopeKey as FaceKey], palette: i } } } };
    return { ...pp, facade: { ...f, typePalette: { ...f.typePalette, [type.id]: i } } };
  });
  const setOverrideOn = (on: boolean) => commit((pp) => {
    const f = pp.facade;
    const k = scopeKey as FaceKey;
    const cur = f.perElevation[k];
    const tid = on ? (cur.override ? cur.typeId : f.activeTypeId) : cur.typeId;
    const next = on && !cur.override ? { override: true, typeId: tid, params: { ...(f.typeParams[tid] ?? {}) }, palette: f.typePalette[tid] ?? 0 } : { ...cur, override: on };
    return { ...pp, facade: { ...f, perElevation: { ...f.perElevation, [k]: next } } };
  });
  const resetParams = () => commit((pp) => {
    const f = pp.facade;
    if (editingOverride) return { ...pp, facade: { ...f, perElevation: { ...f.perElevation, [scopeKey]: { ...f.perElevation[scopeKey as FaceKey], params: defaultParams(type) } } } };
    return { ...pp, facade: { ...f, typeParams: { ...f.typeParams, [type.id]: defaultParams(type) } } };
  });

  const brief = (b: Partial<Brief>) => commit((pp) => relayout(pp, { brief: b }));
  const site = (s: Partial<Site>) => commit((pp) => relayout(pp, { site: s }));
  const setbacks = (k: keyof Site['setbacks'], v: number) => commit((pp) => relayout(pp, { site: { setbacks: { ...pp.site.setbacks, [k]: v } } }));
  const siteSoft = (s: Partial<Site>) => commit((pp: Project) => ({ ...pp, site: { ...pp.site, ...s } }), 'site-soft');

  // ---- selection (plan)
  const li = typeof ui.planLevel === 'number' ? Math.min(ui.planLevel, d.levels.length - 1) : 0;
  const L = d.levels[li];
  const selRooms = ui.view === 'plan' ? ui.selRooms.map((id) => L.level.rooms.find((r) => r.id === id)).filter(Boolean) : [];
  const selOpening = ui.view === 'plan' && ui.selOpening ? L.openings.find((o) => o.id === ui.selOpening) : undefined;
  const ov = selOpening ? p.openingOverrides[selOpening.id] : undefined;

  const fails = d.warnings.filter((w) => w.severity === 'fail').length;

  return (
    <aside className="insp">
      <section>
        <h2><span className="sc">Facade {fnum(type.num)}</span><span className="mono dim">{editingOverride ? `${scopeKey} OVERRIDE` : 'ALL ELEVATIONS'}</span></h2>
        <div className="body">
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>{type.name}</div>
          <p className="desc">{type.description}</p>
          <div className="scope">
            <span className="seg">
              <button className={scopeKey === 'all' ? 'on' : ''} onClick={() => setUI({ scope: 'all' })}>ALL</button>
              {KEYS.map((k) => (
                <button key={k} className={scopeKey === k ? 'on' : ''} onClick={() => setUI({ scope: k })} title={`${FACE_NAME[k]} elevation`}>
                  {k}{p.facade.perElevation[k].override ? '*' : ''}
                </button>
              ))}
            </span>
            {scopeKey !== 'all' && (
              <label style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                <input type="checkbox" checked={!!pe?.override} onChange={(e) => setOverrideOn(e.target.checked)} /> override
              </label>
            )}
          </div>
          {scopeKey !== 'all' && !pe?.override && <p className="note">This elevation follows the active type. Tick override to give {FACE_NAME[scopeKey as FaceKey].toLowerCase()} its own facade; then pick from the catalogue.</p>}
          {editingOverride && (
            <div className="row inline">
              <span className="lab">Type on {scopeKey}</span>
              <select value={pe!.typeId} onChange={(e) => commit((pp) => ({ ...pp, facade: { ...pp.facade, perElevation: { ...pp.facade.perElevation, [scopeKey]: { override: true, typeId: e.target.value, params: defaultParams(getFacade(e.target.value)), palette: 0 } } } }))}>
                {FACADES.map((t) => <option key={t.id} value={t.id}>{fnum(t.num)} {t.name}</option>)}
              </select>
            </div>
          )}
          {(scopeKey === 'all' || editingOverride) && type.params.map((def) => (
            <Param key={def.key} def={def} value={params[def.key] ?? def.default} onChange={(v, done) => setParam(def.key, v, done)} />
          ))}
          {(scopeKey === 'all' || editingOverride) && (
            <>
              <div className="sc" style={{ margin: '10px 0 4px', fontSize: 11 }}>Material palette</div>
              {type.palettes.map((pl, i) => (
                <div key={pl.name} className={'pal' + (palIdx === i ? ' on' : '')} onClick={() => setPalette(i)}>
                  <span className="sw"><i style={{ background: pl.primary }} /><i style={{ background: pl.secondary }} /><i style={{ background: pl.accent }} /></span>
                  <span>{pl.name}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                <button onClick={resetParams}>Reset params</button>
                <label style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  <input type="checkbox" checked={p.facade.climateResponse} onChange={(e) => commit((pp) => ({ ...pp, facade: { ...pp.facade, climateResponse: e.target.checked } }))} /> climate response
                </label>
              </div>
            </>
          )}
          <div className="sc" style={{ margin: '12px 0 4px', fontSize: 11 }}>Solar exposure · lat {p.site.latitude.toFixed(1)}°</div>
          <div className="bars">
            {SIDES.map((s) => {
              const f = d.faces[s];
              return [
                <span key={s + 'k'} className="mono">{f.face.key}</span>,
                <span key={s + 'b'} className="b"><i style={{ width: `${Math.round(f.orient.exposure * 100)}%` }} /></span>,
                <span key={s + 'v'} className="mono dim" style={{ textAlign: 'right' }}>{Math.round(f.orient.cutoff)}°</span>,
              ];
            })}
          </div>
          <p className="note">Bar: relative exposure. Figure: vertical shadow angle used as the cut-off.</p>
          {fdScope.out.notes.map((n, i) => <p key={i} className="note">{fdScope.face.key}: {n}</p>)}
        </div>
      </section>

      {ui.view === 'plan' && (
        <section>
          <h2><span className="sc">Selection</span><span className="mono dim">L{li}</span></h2>
          <div className="body">
            {!selRooms.length && !selOpening && <p className="note" style={{ marginTop: 0 }}>Click a room to select; drag its edge handles to resize (snaps to 150 mm and grid lines). Shift-click two rooms to merge. Click an opening marker to override it.</p>}
            {selRooms.length === 1 && (() => {
              const r = selRooms[0]!;
              const c = L.clear.get(r.id)!;
              return (
                <>
                  <div className="field"><span>Name</span><input type="text" value={r.name} onChange={(e) => commit((pp) => setRoom(pp, li, r.id, { name: e.target.value }), `name:${r.id}`)} /></div>
                  <div className="field"><span>Type</span>
                    <select value={r.type} disabled={r.type === 'stair'} onChange={(e) => commit((pp) => setRoom(pp, li, r.id, { type: e.target.value as RoomType }))}>
                      {(Object.keys(ROOM_LABEL) as RoomType[]).filter((t) => t !== 'stair' || r.type === 'stair').map((t) => <option key={t} value={t}>{ROOM_LABEL[t]}</option>)}
                    </select>
                  </div>
                  <div className="field"><span>Clear size</span><span className="mono">{rw(c).toFixed(2)} × {rh(c).toFixed(2)} m</span></div>
                  <div className="field"><span>Clear area</span><span className="mono">{area(c).toFixed(2)} m²</span></div>
                  <div className="field"><span>Glazing / vent</span><span className="mono">{L.openings.filter((o) => o.roomId === r.id).reduce((a, o) => a + o.glazedArea, 0).toFixed(2)} / {L.openings.filter((o) => o.roomId === r.id).reduce((a, o) => a + o.ventArea, 0).toFixed(2)} m²</span></div>
                </>
              );
            })()}
            {selRooms.length === 2 && (
              <button disabled={!canMerge(p, li, ui.selRooms)} onClick={() => { commit((pp) => mergeRooms(pp, li, ui.selRooms)); setUI({ selRooms: [ui.selRooms[0]] }); }}>
                Merge {selRooms[0]!.name} + {selRooms[1]!.name}
              </button>
            )}
            {selOpening && (
              <>
                <div className="field"><span>{selOpening.tag} · {selOpening.kind}</span><span className="mono dim">{selOpening.overridden ? 'OVERRIDDEN' : 'DERIVED'}</span></div>
                {(['width', 'sill', 'head'] as const).map((k) => (
                  <div className="field" key={k}><span>{k[0].toUpperCase() + k.slice(1)}</span>
                    <Stepper value={selOpening[k]} step={0.15} min={k === 'width' ? 0.45 : 0} max={k === 'width' ? 6 : 3} fmt={(n) => (n * 1000).toFixed(0)}
                      onChange={(n) => commit((pp) => setOverride(pp, selOpening.id, { [k]: n }))} />
                  </div>
                ))}
                <div className="field"><span>Shift along wall</span>
                  <Stepper value={ov?.shift ?? 0} step={0.15} min={-6} max={6} fmt={(n) => (n * 1000).toFixed(0)} onChange={(n) => commit((pp) => setOverride(pp, selOpening.id, { shift: n }))} />
                </div>
                <div className="field"><span>Glazed / vent</span><span className="mono">{selOpening.glazedArea.toFixed(2)} / {selOpening.ventArea.toFixed(2)} m²</span></div>
                <div className="field"><span>Screen must pass</span><span className="mono">{Math.round(selOpening.reqRatio * 100)}% open</span></div>
                <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                  <button onClick={() => commit((pp) => setOverride(pp, selOpening.id, { suppressed: true }))}>Remove</button>
                  <button disabled={!selOpening.overridden} onClick={() => commit((pp) => setOverride(pp, selOpening.id, null))}>Reset to derived</button>
                </div>
              </>
            )}
            {Object.values(p.openingOverrides).some((o) => o.suppressed) && (
              <p className="note"><button onClick={() => commit((pp) => ({ ...pp, openingOverrides: Object.fromEntries(Object.entries(pp.openingOverrides).filter(([, o]) => !o.suppressed)) }))}>Restore removed openings</button></p>
            )}
          </div>
        </section>
      )}

      <section>
        <h2 className="collapse" onClick={() => setUI({ briefOpen: !ui.briefOpen })}><span className="sc">{ui.briefOpen ? '▾' : '▸'} Brief &amp; site</span><span className="mono dim">{p.brief.floors}F · {p.brief.bedrooms}BR</span></h2>
        {ui.briefOpen && (
          <div className="body">
            <div className="field"><span>Floors</span><Stepper value={p.brief.floors} step={1} min={1} max={3} onChange={(n) => brief({ floors: n })} /></div>
            <div className="field"><span>Bedrooms</span><Stepper value={p.brief.bedrooms} step={1} min={1} max={5} onChange={(n) => brief({ bedrooms: n })} /></div>
            <div className="field"><span>Bathrooms</span><Stepper value={p.brief.bathrooms} step={1} min={1} max={6} onChange={(n) => brief({ bathrooms: n })} /></div>
            <div className="field"><span>Studies</span><Stepper value={p.brief.studies} step={1} min={0} max={3} onChange={(n) => brief({ studies: n })} /></div>
            <div className="field"><span>Parking</span><Stepper value={p.brief.parking} step={1} min={0} max={3} onChange={(n) => brief({ parking: n })} /></div>
            <div className="field"><span>Double-height living</span><input type="checkbox" checked={p.brief.doubleHeightLiving} onChange={(e) => brief({ doubleHeightLiving: e.target.checked })} /></div>
            <div className="field"><span>Floor to floor</span><Stepper value={p.brief.floorToFloor} step={0.05} min={2.8} max={4.2} fmt={(n) => (n * 1000).toFixed(0)} onChange={(n) => brief({ floorToFloor: n })} /></div>
            <div className="field"><span>Plinth</span><Stepper value={p.brief.plinth} step={0.15} min={0.15} max={1.2} fmt={(n) => (n * 1000).toFixed(0)} onChange={(n) => brief({ plinth: n })} /></div>
            <div className="field"><span>Stair</span>
              <select value={p.stair.type} onChange={(e) => commit((pp) => relayout(pp, { stairType: e.target.value as 'dogleg' | 'straight' }))}>
                <option value="dogleg">Dog-leg</option><option value="straight">Straight</option>
              </select>
            </div>
            <div className="sc" style={{ margin: '10px 0 2px', fontSize: 11 }}>Site</div>
            <div className="field"><span>Width</span><Stepper value={p.site.width} step={0.5} min={7} max={40} fmt={(n) => n.toFixed(1)} onChange={(n) => site({ width: n })} /></div>
            <div className="field"><span>Depth</span><Stepper value={p.site.depth} step={0.5} min={12} max={60} fmt={(n) => n.toFixed(1)} onChange={(n) => site({ depth: n })} /></div>
            {(['front', 'rear', 'left', 'right'] as const).map((k) => (
              <div className="field" key={k}><span>Setback {k}</span><Stepper value={p.site.setbacks[k]} step={0.25} min={0} max={12} fmt={(n) => n.toFixed(2)} onChange={(n) => setbacks(k, n)} /></div>
            ))}
            <div className="field"><span>North angle</span><Stepper value={p.site.northAngle} step={15} min={-180} max={180} fmt={(n) => `${n}°`} onChange={(n) => siteSoft({ northAngle: n })} /></div>
            <div className="field"><span>Latitude</span><Stepper value={p.site.latitude} step={1} min={-60} max={60} fmt={(n) => `${n.toFixed(1)}°`} onChange={(n) => siteSoft({ latitude: n })} /></div>
            <p className="note">Brief and site changes re-run the layout; facades, openings and drawings follow.</p>
          </div>
        )}
      </section>

      <section>
        <h2 className="collapse" onClick={() => setWarnOpen(!warnOpen)}>
          <span className="sc">{warnOpen ? '▾' : '▸'} Warnings</span>
          <span className={'mono ' + (fails ? 'accent' : 'dim')}>{d.warnings.length ? `${fails} FAIL · ${d.warnings.length - fails} NOTE` : 'NONE'}</span>
        </h2>
        {warnOpen && (
          <ul className="warn">
            {!d.warnings.length && <li><span /><span className="dim">All checks pass: room minima, daylight 1/10, ventilation 1/20, stair geometry, spans, setbacks, stacking, facade vs openings.</span><span /></li>}
            {d.warnings.map((w, i) => {
              const link = w.ref && w.level !== undefined;
              return (
                <li key={i} className={link ? 'link' : ''} onClick={() => { if (link) setUI({ view: 'plan', planLevel: w.level!, selRooms: [w.ref!], selOpening: null }); }}>
                  <span className={'mk ' + w.severity} />
                  <span>{w.message}</span>
                  <span className="lv">{w.level !== undefined ? `L${w.level}` : w.code.toUpperCase()}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </aside>
  );
}
