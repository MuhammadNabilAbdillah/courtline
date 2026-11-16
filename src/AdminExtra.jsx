import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { FORMATS, TZS, courtList, fmtDate, fmtTime, tzLabel, tn, DEFAULTS } from './util'
import { exportXlsx } from './export'

// Change history: written by every staff action that matters (the server fills in who did it)
export const log = (action, detail = '') => supabase.from('audit_log').insert({ action, detail }).then(() => {}, () => {})
export const mname = m => `${tn(m.t1) || m.slot1 || 'TBD'} vs ${tn(m.t2) || m.slot2 || 'TBD'}`
const download = (obj, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })); a.download = name; a.click() }

export function CourtSelect({ value, onChange, courts }) {
  const list = [...new Set([...courts, value].filter(Boolean))]
  return <select value={value} onChange={e => onChange(e.target.value)} aria-label="Court">{list.map(c => <option key={c} value={c}>{c}</option>)}</select>
}

export function WalkoverBox({ m, onSave, onCancel }) {
  const [w, setW] = useState('')
  return <div className="editbox">
    <h4>Walkover (opponent did not show up)</h4>
    <p className="muted">Pick the team that <b>showed up</b>. They win, and the result is recorded with a standard walkover score.</p>
    <div className="fm"><select value={w} onChange={e => setW(e.target.value)}><option value="">Winning team…</option><option value="0">{tn(m.t1)}</option><option value="1">{tn(m.t2)}</option></select></div>
    <div className="ctrl"><button className="btn sm" disabled={w === ''} onClick={() => onSave(+w)}>Record walkover</button><button className="btn o sm" onClick={onCancel}>Cancel</button></div>
  </div>
}

export function NoteBox({ m, onSave, onCancel }) {
  const [r, setR] = useState(m.referee || ''), [n, setN] = useState(m.notes || '')
  return <div className="editbox">
    <h4>Referee & notes</h4>
    <div className="fm">
      <input placeholder="Referee name" maxLength={60} value={r} onChange={e => setR(e.target.value)} />
      <input className="wide" placeholder="Note shown on the match, e.g. Paused 10 min for rain" maxLength={200} value={n} onChange={e => setN(e.target.value)} />
    </div>
    <div className="ctrl"><button className="btn sm" onClick={() => onSave({ referee: r.trim() || null, notes: n.trim() || null })}>Save</button><button className="btn o sm" onClick={onCancel}>Cancel</button></div>
  </div>
}

// Quick rescheduling: swap order, nudge by 15 minutes or change court. Clash warnings come from the callers.
export function Reorder({ ms, courts, edit, swap }) {
  const [open, setOpen] = useState(false)
  const list = ms.filter(m => m.status === 'scheduled').sort((a, b) => new Date(a.start_at) - new Date(b.start_at))
  const shift = (m, min) => edit(m, { start_at: new Date(+new Date(m.start_at) + min * 6e4).toISOString() }, 'Moved match')
  return <div className="panel">
    <div className="ph"><h3>Reorder schedule</h3><button className="btn o sm" onClick={() => setOpen(!open)}>{open ? 'Hide' : `Open (${list.length})`}</button></div>
    {open && <>
      <p className="muted">▲ ▼ swap the time slot and court with the neighbouring match. −15 / +15 move one match. You get a warning if a court or a team would be double-booked.</p>
      <div className="items">{list.map((m, i) => <div className="item rs" key={m.id}>
        <div className="im"><b>{fmtTime(m.start_at)} · {mname(m)}</b><small>{fmtDate(m.start_at)} · {m.round}</small></div>
        <div className="ia">
          <button className="btn o sm" disabled={i === 0} aria-label="Swap with the match above" onClick={() => swap(list[i - 1], m)}>▲</button>
          <button className="btn o sm" disabled={i === list.length - 1} aria-label="Swap with the match below" onClick={() => swap(m, list[i + 1])}>▼</button>
          <button className="btn o sm" onClick={() => shift(m, -15)}>−15</button>
          <button className="btn o sm" onClick={() => shift(m, 15)}>+15</button>
          <CourtSelect value={m.court} courts={courts} onChange={c => c !== m.court && edit(m, { court: c }, 'Changed court')} />
        </div></div>)}</div>
      {!list.length && <p className="muted">No upcoming matches to reorder.</p>}
    </>}
  </div>
}

export function ExportPanel({ tours, teams, matches, at, onPrint }) {
  const [sel, setSel] = useState(at || 'all')
  return <div className="panel"><h3>Export & print</h3>
    <p className="muted">Excel has three sheets: standings, all matches (with scores, walkovers, referee and notes) and the team list. For PDF, choose <b>Save as PDF</b> in the print window.</p>
    <div className="fm"><select value={sel} onChange={e => setSel(e.target.value)}><option value="all">All tournaments</option>{tours.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
    <div className="ctrl">
      <button className="btn" onClick={() => exportXlsx({ tours, teams, matches, tid: sel })}>Download Excel (.xlsx)</button>
      <button className="btn o" onClick={() => onPrint('report', sel)}>Standings & results (PDF)</button>
      <button className="btn o" onClick={() => onPrint('schedule', sel)}>Print schedule</button>
    </div>
  </div>
}

export function HistoryPanel() {
  const [rows, setRows] = useState(null), [q, setQ] = useState(''), [err, setErr] = useState('')
  const load = () => supabase.from('audit_log').select('*').order('at', { ascending: false }).limit(400).then(r => { if (r.error) setErr(r.error.message); else { setErr(''); setRows(r.data) } })
  useEffect(() => { load() }, [])
  const list = (rows || []).filter(r => `${r.actor} ${r.action} ${r.detail || ''}`.toLowerCase().includes(q.toLowerCase()))
  return <div className="panel"><div className="ph"><h3>Change history</h3><button className="btn o sm" onClick={load}>Refresh</button></div>
    <p className="muted">Who changed a score, schedule, team or setting, and when. Individual points are not listed; the final result of each match is.</p>
    <div className="fm"><input className="wide" placeholder="Search name, action or match…" value={q} onChange={e => setQ(e.target.value)} /></div>
    {err && <p className="err">{err}{/relation|schema cache/i.test(err) ? ' — run the latest supabase.sql first.' : ''}</p>}
    {rows && <div className="scroll"><table className="tb left hist"><thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead>
      <tbody>{list.map(r => <tr key={r.id}><td className="nw">{fmtDate(r.at)} {fmtTime(r.at)}</td><td><b>{r.actor || '–'}</b></td><td><b>{r.action}</b>{r.detail ? <><br /><small>{r.detail}</small></> : null}</td></tr>)}</tbody></table></div>}
    {rows && !list.length && <p className="muted">Nothing recorded yet.</p>}
  </div>
}

// Downsizes an uploaded image to a small PNG so it can live in the settings row (no file storage needed)
const readLogo = file => new Promise((res, rej) => {
  const img = new Image(), url = URL.createObjectURL(file)
  img.onload = () => {
    const k = Math.min(1, 160 / Math.max(img.width, img.height, 1)), c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k))
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/png'))
  }
  img.onerror = () => rej(new Error('Could not read that image'))
  img.src = url
})

export function SiteSettings({ settings, save }) {
  const [f, setF] = useState({ name: settings.name || '', color: settings.color || DEFAULTS.color, logo: settings.logo || '' })
  const pick = async e => { const file = e.target.files[0]; e.target.value = ''; if (!file) return; try { setF({ ...f, logo: await readLogo(file) }) } catch (x) { alert(x.message) } }
  const ok = /^#[0-9a-f]{6}$/i.test(f.color)
  return <div className="panel"><h3>Site</h3>
    <p className="muted">Event name, logo and main colour shown to everyone. Leave the name empty to keep "Courtline".</p>
    <div className="prev" style={{ background: ok ? f.color : DEFAULTS.color }}>
      {f.logo ? <img src={f.logo} alt="" /> : <span className="pl">LOGO</span>}<b>{f.name || 'Courtline'}</b>
    </div>
    <div className="fm">
      <input className="wide" maxLength={60} placeholder="Event name, e.g. Padel Cup 2026" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
      <label className="colorp">Main colour <input type="color" value={ok ? f.color : DEFAULTS.color} onChange={e => setF({ ...f, color: e.target.value })} /></label>
      <input placeholder="#032a5f" maxLength={7} value={f.color} onChange={e => setF({ ...f, color: e.target.value })} />
      <label className="btn o">Choose logo<input type="file" accept="image/*" hidden onChange={pick} /></label>
      {f.logo && <button className="btn o" onClick={() => setF({ ...f, logo: '' })}>Remove logo</button>}
      <button className="btn o" onClick={() => setF({ ...f, color: DEFAULTS.color })}>Reset colour</button>
    </div>
    <div className="ctrl"><button className="btn" disabled={!ok} onClick={() => save({ name: f.name.trim(), color: f.color, logo: f.logo }, 'Updated site settings', f.name.trim() || 'Courtline')}>Save site settings</button></div>
  </div>
}

export function TimeSettings({ settings, save }) {
  const [tz, setTz] = useState(settings.tz), [h12, setH12] = useState(!!settings.hour12)
  return <div className="panel"><h3>Time zone & clock</h3>
    <p className="muted">Every time on the site and in the admin console follows this zone, whatever the viewer's phone says. Currently shown as <b>{tzLabel()}</b>.</p>
    <div className="fm">
      <select value={tz} onChange={e => setTz(e.target.value)}>{TZS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <select value={h12} onChange={e => setH12(e.target.value === 'true')}><option value="false">24-hour (14:30)</option><option value="true">12-hour (2:30 pm)</option></select>
      <button className="btn" onClick={() => save({ tz, hour12: h12 }, 'Updated time settings', `${tz}, ${h12 ? '12h' : '24h'}`)}>Save</button>
    </div>
  </div>
}

export function RuleSettings({ settings, save }) {
  const [f, setF] = useState({ fmt: settings.fmt, golden: settings.golden, duration: settings.duration, autoLock: !!settings.autoLock })
  return <div className="panel"><h3>Default match rules</h3>
    <p className="muted">Pre-filled when you schedule a match or generate the knockout stage, so you do not have to pick them every time.</p>
    <div className="fm">
      <select value={f.fmt} onChange={e => setF({ ...f, fmt: e.target.value })}>{Object.entries(FORMATS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
      <select value={f.golden} onChange={e => setF({ ...f, golden: e.target.value === 'true' })}><option value="true">Golden point</option><option value="false">Advantage</option></select>
      <select value={f.duration} onChange={e => setF({ ...f, duration: +e.target.value })}>{[30, 45, 60, 75, 90, 120].map(x => <option key={x} value={x}>{x} min</option>)}</select>
      <label className="chk full"><input type="checkbox" checked={f.autoLock} onChange={e => setF({ ...f, autoLock: e.target.checked })} /> Lock a match automatically when it finishes (an admin can unlock it)</label>
    </div>
    <div className="ctrl"><button className="btn" onClick={() => save(f, 'Updated default rules', `${f.fmt}, ${f.golden ? 'golden point' : 'advantage'}, ${f.duration} min${f.autoLock ? ', auto-lock' : ''}`)}>Save defaults</button></div>
  </div>
}

export function CourtsPanel({ settings, save }) {
  const cur = courtList(settings), [nn, setNn] = useState(''), [ed, setEd] = useState({})
  const dup = (n, skip) => cur.some((c, k) => k !== skip && c.name.toLowerCase() === n.toLowerCase())
  const add = e => {
    e.preventDefault(); const n = nn.trim()
    if (!n) return
    if (dup(n, -1)) return alert('That court already exists')
    save({ courts: [...cur, { name: n, active: true }] }, 'Added court', n).then(ok => ok && setNn(''))
  }
  const toggle = i => {
    if (cur[i].active && cur.filter(c => c.active).length === 1) return alert('Keep at least one active court')
    save({ courts: cur.map((c, k) => k === i ? { ...c, active: !c.active } : c) }, cur[i].active ? 'Disabled court' : 'Enabled court', cur[i].name)
  }
  const rename = async i => {
    const n = (ed[i] ?? '').trim(), old = cur[i].name
    if (!n || n === old) return
    if (dup(n, i)) return alert('That name is already used')
    const r = await supabase.from('matches').update({ court: n }).eq('court', old)
    if (r.error) return alert(r.error.message)
    if (await save({ courts: cur.map((c, k) => k === i ? { ...c, name: n } : c) }, 'Renamed court', `${old} → ${n}`)) setEd({ ...ed, [i]: undefined })
  }
  return <div className="panel"><h3>Courts</h3>
    <p className="muted">Courts you can pick when scheduling. Renaming also updates the court on existing matches. A disabled court disappears from the pickers but old matches keep their name.</p>
    <form className="fm" onSubmit={add}><input placeholder="New court name, e.g. Center Court" maxLength={40} value={nn} onChange={e => setNn(e.target.value)} /><button className="btn">Add court</button></form>
    <div className="items">{cur.map((c, i) => <div className="item rs" key={i}>
      <div className="im"><input value={ed[i] ?? c.name} maxLength={40} onChange={e => setEd({ ...ed, [i]: e.target.value })} aria-label="Court name" /></div>
      {!c.active && <span className="chip">Disabled</span>}
      <div className="ia">
        {(ed[i] ?? c.name).trim() !== c.name && <button className="btn sm" onClick={() => rename(i)}>Save name</button>}
        <button className="btn o sm" onClick={() => toggle(i)}>{c.active ? 'Disable' : 'Enable'}</button>
      </div></div>)}</div>
  </div>
}

// Restores data from a backup object. Locked matches are unlocked first (only the ones in the backup) so they can be overwritten.
export async function restoreData(d) {
  if (!d || d.app !== 'courtline') throw new Error('This is not a Courtline backup file')
  const ids = (d.matches || []).map(m => m.id)
  for (let i = 0; i < ids.length; i += 40) await supabase.from('matches').update({ locked: false }).in('id', ids.slice(i, i + 40)).eq('locked', true)
  for (const [tb, rows] of [['tournaments', d.tournaments], ['teams', d.teams], ['matches', d.matches], ['announcements', d.announcements], ['settings', d.settings]]) {
    if (!rows || !rows.length) continue
    const r = await supabase.from(tb).upsert(rows); if (r.error) throw r.error
  }
}

export function BackupPanel({ load }) {
  const [list, setList] = useState(null), [busy, setBusy] = useState(false)
  const refresh = () => supabase.from('backups').select('id,created_at,kind').order('created_at', { ascending: false }).limit(60).then(r => setList(r.error ? false : r.data))
  useEffect(() => { refresh() }, [])
  const snap = async () => {
    const T = ['tournaments', 'teams', 'matches', 'announcements', 'settings'], r = await Promise.all(T.map(x => supabase.from(x).select('*')))
    const o = { app: 'courtline', exported_at: new Date().toISOString() }; T.forEach((x, i) => { o[x] = r[i].data || [] }); return o
  }
  const getData = async id => { const r = await supabase.from('backups').select('data').eq('id', id).single(); if (r.error) throw r.error; return r.data.data }
  const restoreFile = async e => {
    const file = e.target.files[0]; e.target.value = ''
    if (!file || !confirm('Restore this backup? Records with the same ID will be overwritten.')) return
    try { await restoreData(JSON.parse(await file.text())); log('Restored backup', file.name); alert('Backup restored'); load() } catch (x) { alert(x.message) }
  }
  const now = async () => {
    setBusy(true); const r = await supabase.rpc('make_backup', { k: 'manual' }); setBusy(false)
    if (r.error) return alert(r.error.message + (/function|schema cache/i.test(r.error.message) ? '\nRun the latest supabase.sql first.' : ''))
    refresh()
  }
  return <div className="panel"><h3>Backups</h3>
    <p className="muted">A copy of everything (tournaments, teams, matches, announcements, settings) is saved automatically every 6 hours, and whenever an admin opens this console and the last copy is older than that. The newest 60 are kept.</p>
    <div className="fm">
      <button className="btn" onClick={async () => { download(await snap(), `courtline-backup-${new Date().toISOString().slice(0, 10)}.json`); log('Downloaded backup') }}>Download backup file</button>
      <label className="btn o">Restore from file<input type="file" accept="application/json" hidden onChange={restoreFile} /></label>
      <button className="btn o" disabled={busy} onClick={now}>{busy ? 'Saving…' : 'Back up now'}</button>
    </div>
    {list === false && <p className="muted">Automatic backups need the latest supabase.sql (it creates the backups table).</p>}
    {list && <div className="scroll"><table className="tb left"><tbody>{list.map(b => <tr key={b.id}>
      <td className="nw">{fmtDate(b.created_at)} {fmtTime(b.created_at)}</td><td>{b.kind === 'auto' ? 'Automatic' : 'Manual'}</td>
      <td className="ra"><button className="btn o sm" onClick={async () => { try { download(await getData(b.id), `courtline-backup-${b.id}.json`) } catch (x) { alert(x.message) } }}>Download</button>{' '}
        <button className="btn o sm" onClick={async () => { if (!confirm('Restore this backup? Records with the same ID will be overwritten.')) return; try { await restoreData(await getData(b.id)); log('Restored backup', `${fmtDate(b.created_at)} ${fmtTime(b.created_at)}`); alert('Backup restored'); load() } catch (x) { alert(x.message) } }}>Restore</button></td></tr>)}</tbody></table></div>}
    {list && !list.length && <p className="muted">No automatic backups yet.</p>}
  </div>
}
