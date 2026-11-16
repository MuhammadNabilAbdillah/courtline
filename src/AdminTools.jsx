import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { fmtOptions, fmtRow, toLocal, fromLocal, fmtDate, fmtTime, tn, clash } from './util'
import { log, mname } from './AdminExtra'

const HH = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MM = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))
const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F']

// Date + 24h time picker (5-minute steps), in the event time zone from Settings
export function DT({ value, onChange }) {
  const l = toLocal(value), d = l.slice(0, 10), h = l.slice(11, 13), m = l.slice(14, 16)
  const set = (a, b, c) => a && onChange(fromLocal(`${a}T${b}:${c}`))
  return <div className="dt">
    <input type="date" value={d} onChange={e => set(e.target.value, h, m)} />
    <div className="tp">
      <select value={h} onChange={e => set(d, e.target.value, m)}>{HH.map(x => <option key={x}>{x}</option>)}</select><b>:</b>
      <select value={m} onChange={e => set(d, h, e.target.value)}>{[...new Set([...MM, m])].sort().map(x => <option key={x}>{x}</option>)}</select>
    </div>
  </div>
}
const TimeOfDay = ({ min, onChange, label }) => {
  const h = String(Math.floor(min / 60)).padStart(2, '0'), m = String(min % 60).padStart(2, '0')
  return <label className="fl">{label}<div className="tp">
    <select value={h} onChange={e => onChange(+e.target.value * 60 + +m)}>{HH.map(x => <option key={x}>{x}</option>)}</select><b>:</b>
    <select value={m} onChange={e => onChange(+h * 60 + +e.target.value)}>{MM.map(x => <option key={x}>{x}</option>)}</select></div></label>
}

// Score recorded for a walkover: the winner gets the full target (6-0 6-0 in best-of-3, 6-0 in a race to 6, ...)
export const woSets = (m, w) => { const n = m.target || 6, one = [w ? 0 : n, w ? n : 0]; return m.best_of === 1 || m.target ? [one] : [one, [...one]] }

// ---------- Overview: how far along the event is ----------
export function Overview({ ms, tm }) {
  const done = ms.filter(m => m.status === 'finished').length, live = ms.filter(m => m.status === 'live').length
  const todo = ms.filter(m => m.status === 'scheduled'), total = ms.length, pct = total ? Math.round((done / total) * 100) : 0
  const late = todo.filter(m => +new Date(m.start_at) < Date.now() - 5 * 6e4)
  const next = [...todo].sort((a, b) => new Date(a.start_at) - new Date(b.start_at))[0]
  const end = ms.filter(m => m.status !== 'finished').reduce((mx, m) => Math.max(mx, +new Date(m.start_at) + (m.duration || 60) * 6e4), 0)
  const empty = ms.filter(m => m.status !== 'finished' && m.round === 'Group Stage' && (!m.team1 || !m.team2)).length
  return <div className="panel"><h3>Overview</h3>
    <div className="ov">{[[tm.length, 'Teams'], [total, 'Matches'], [live, 'Live'], [done, 'Finished'], [todo.length, 'To play']].map(([n, l]) => <div key={l}><b>{n}</b><span>{l}</span></div>)}</div>
    <div className="prog"><i style={{ width: pct + '%' }} /></div>
    <p className="muted">{pct}% played{end ? ` · schedule ends about ${fmtTime(end)} on ${fmtDate(end)}` : ''}</p>
    {next && <p>Next up: <b>{fmtTime(next.start_at)}</b> · {next.court} · {mname(next)}</p>}
    {late.length > 0 && <p className="warnline">⚠ {late.length} match(es) are past their start time and have not started. Start them, or use "Delay all upcoming".</p>}
    {empty > 0 && <p className="warnline">⚠ {empty} group match(es) have an empty team slot. Open Edit to pick the teams.</p>}
    {!total && <p className="muted">No matches yet. Use "Generate group fixtures" below, or schedule a match by hand.</p>}
  </div>
}

// ---------- Round-robin fixtures ----------
const key = (a, b) => [a, b].sort().join('|')
const circle = ids => { // circle method: every team meets every other team once, one round at a time
  if (ids.length < 2) return []
  const arr = ids.length % 2 ? [...ids, null] : [...ids], n = arr.length, rounds = []
  for (let r = 0; r < n - 1; r++) {
    const rd = []
    for (let i = 0; i < n / 2; i++) { const a = arr[i], b = arr[n - 1 - i]; if (a && b) rd.push([a, b]) }
    rounds.push(rd); arr.splice(1, 0, arr.pop())
  }
  return rounds
}
const naive = s => { const [d, t] = s.split('T'), [y, m, dd] = d.split('-').map(Number), [h, mi] = t.split(':').map(Number); return Date.UTC(y, m - 1, dd, h, mi) }
const asLocal = ms => new Date(ms).toISOString().slice(0, 16)
const minOfDay = ms => { const d = new Date(ms); return d.getUTCHours() * 60 + d.getUTCMinutes() }
const nextDay = (ms, min) => { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, min) }

// groups: { A: [teamId, ...] }, have: Set of "idA|idB" pairs that already have a group match, courts: [names],
// start: "YYYY-MM-DDTHH:MM" (event time), len: minutes per slot, dayEnd / nextStart: minutes of the day (dayEnd null = play non-stop)
export function planFixtures({ groups, have, courts, start, len, dayEnd, nextStart }) {
  const per = Object.keys(groups).sort().map(g => circle(groups[g]).map(r => r.filter(([a, b]) => !have.has(key(a, b))).map(([a, b]) => ({ a, b, g }))))
  const pending = [], most = Math.max(0, ...per.map(r => r.length))
  for (let r = 0; r < most; r++) per.forEach(rs => rs[r] && pending.push(...rs[r]))
  const last = {}, rows = []; let slot = 0, cur = naive(start)
  const roll = dayEnd != null && nextStart != null && dayEnd - nextStart >= len
  while (pending.length && courts.length && slot < 3000) {
    if (roll && minOfDay(cur) + len > dayEnd) cur = nextDay(cur, nextStart)
    const busy = new Set()
    for (const court of courts) {
      let best = -1, bestRest = -1
      pending.forEach((m, i) => { // prefer the pair whose teams have rested the longest
        if (busy.has(m.a) || busy.has(m.b)) return
        const rest = slot - Math.max(last[m.a] ?? -9, last[m.b] ?? -9)
        if (rest > bestRest) { best = i; bestRest = rest }
      })
      if (best < 0) break
      const [m] = pending.splice(best, 1); busy.add(m.a); busy.add(m.b); last[m.a] = slot; last[m.b] = slot
      rows.push({ team1: m.a, team2: m.b, grp: m.g, court, slot, local: asLocal(cur) })
    }
    cur += len * 6e4; slot++
  }
  return { rows, slots: slot }
}

export function FixtureGenerator({ tm, ms, tid, courts, settings, load }) {
  const defStart = () => { const d = new Date(); d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0); return d.toISOString() }
  const [open, setOpen] = useState(false)
  const [f, setF] = useState(() => ({ start_at: defStart(), len: settings.duration || 30, fmt: settings.fmt, nonstop: false, dayEnd: 18 * 60, nextStart: 8 * 60, picked: courts }))
  const useCourts = courts.filter(c => f.picked.includes(c))
  const groups = useMemo(() => { const g = {}; tm.forEach(t => { (g[t.grp] = g[t.grp] || []).push(t.id) }); return g }, [tm])
  const have = useMemo(() => new Set(ms.filter(m => m.round === 'Group Stage' && m.team1 && m.team2).map(m => key(m.team1, m.team2))), [ms])
  const bad = !f.nonstop && f.dayEnd - f.nextStart < f.len
  const plan = useMemo(() => open && !bad ? planFixtures({ groups, have, courts: useCourts, start: toLocal(f.start_at), len: +f.len, dayEnd: f.nonstop ? null : f.dayEnd, nextStart: f.nonstop ? null : f.nextStart }) : null,
    [open, bad, groups, have, f.start_at, f.len, f.nonstop, f.dayEnd, f.nextStart, f.picked.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  const names = Object.fromEntries(tm.map(t => [t.id, tn(t)]))
  const sizes = Object.keys(groups).sort().map(g => `${g}: ${groups[g].length}`).join(' · ')
  const days = plan ? [...new Set(plan.rows.map(r => r.local.slice(0, 10)))].length : 0
  const lastRow = plan && plan.rows[plan.rows.length - 1]
  const clashes = plan ? plan.rows.filter(r => ms.some(o => o.status !== 'finished' && o.court === r.court && clash({ start_at: fromLocal(r.local), duration: +f.len }, o))).length : 0
  const go = async () => {
    const rows = plan.rows.map(r => ({ tournament_id: tid, team1: r.team1, team2: r.team2, court: r.court, round: 'Group Stage', start_at: fromLocal(r.local), duration: +f.len, golden: settings.golden, ...fmtRow(f.fmt) }))
    if (!confirm(`Create ${rows.length} group matches?`)) return
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await supabase.from('matches').insert(rows.slice(i, i + 100))
      if (error) { alert(error.message); load(); return }
    }
    log('Generated group fixtures', `${rows.length} matches, ${Object.keys(groups).length} group(s)`); setOpen(false); load()
  }
  const clear = async () => {
    const n = ms.filter(m => m.round === 'Group Stage' && m.status === 'scheduled').length
    if (!n) return alert('There are no unplayed group matches to remove.')
    if (!confirm(`Delete ${n} group match(es) that have not started? Matches that are live or finished are kept.`)) return
    const { error } = await supabase.from('matches').delete().eq('tournament_id', tid).eq('round', 'Group Stage').eq('status', 'scheduled')
    if (error) return alert(error.message)
    log('Cleared unplayed group matches', `${n} match(es)`); load()
  }
  return <div className="panel">
    <div className="ph"><h3>Generate group fixtures</h3><button className="btn o sm" onClick={() => setOpen(!open)}>{open ? 'Close' : 'Open'}</button></div>
    <p className="muted">Creates every group match (each team plays every other team in its group once) and spreads them over your courts and days, so a team never plays two matches at the same time and gets a rest between matches whenever possible. Pairs that already have a match are skipped.</p>
    {open && <>
      <div className="fm">
        <div className="full"><DT value={f.start_at} onChange={v => setF({ ...f, start_at: v })} /></div>
        <label className="fl">Minutes per match slot<select value={f.len} onChange={e => setF({ ...f, len: +e.target.value })}>{[15, 20, 25, 30, 40, 45, 60, 75, 90].map(x => <option key={x} value={x}>{x} min</option>)}</select></label>
        <label className="fl">Scoring<select value={f.fmt} onChange={e => setF({ ...f, fmt: e.target.value })}>{fmtOptions(f.fmt).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="chk full"><input type="checkbox" checked={f.nonstop} onChange={e => setF({ ...f, nonstop: e.target.checked })} /> Play non-stop (no daily end time)</label>
        {!f.nonstop && <><TimeOfDay label="Last match must end by" min={f.dayEnd} onChange={v => setF({ ...f, dayEnd: v })} /><TimeOfDay label="Next day starts at" min={f.nextStart} onChange={v => setF({ ...f, nextStart: v })} /></>}
        <div className="full"><small className="muted">Courts to use</small><div className="ctrl">{courts.map(c => <label key={c} className="chk"><input type="checkbox" checked={f.picked.includes(c)} onChange={e => setF({ ...f, picked: e.target.checked ? [...f.picked, c] : f.picked.filter(x => x !== c) })} /> {c}</label>)}</div></div>
      </div>
      {bad && <p className="err">The time between "next day starts" and "last match must end by" is shorter than one slot.</p>}
      {!useCourts.length && <p className="err">Pick at least one court.</p>}
      {!tm.length && <p className="err">Add teams first.</p>}
      {plan && <div className="imps">
        <p>Groups ({sizes || 'none'}). <b>{plan.rows.length}</b> new match(es) in <b>{plan.slots}</b> time slot(s) over <b>{days}</b> day(s){lastRow ? <>; the last one starts {fmtTime(fromLocal(lastRow.local))} on {fmtDate(fromLocal(lastRow.local))}</> : ''}.</p>
        {clashes > 0 && <p className="warnline">⚠ {clashes} new match(es) overlap a match that already exists on the same court.</p>}
        {plan.rows.length > 0 && <div className="scroll"><table className="tb left"><tbody>{plan.rows.slice(0, 16).map((r, i) => <tr key={i}><td className="nw">{fmtDate(fromLocal(r.local))} {fmtTime(fromLocal(r.local))}</td><td>{r.court}</td><td>Group {r.grp}</td><td><b>{names[r.team1]}</b> vs <b>{names[r.team2]}</b></td></tr>)}</tbody></table></div>}
        {plan.rows.length > 16 && <p className="muted">Showing the first 16 of {plan.rows.length}.</p>}
        {!plan.rows.length && <p className="muted">Nothing to create: every pair in every group already has a match, or there are fewer than 2 teams per group.</p>}
      </div>}
      <div className="ctrl"><button className="btn" disabled={!plan || !plan.rows.length} onClick={go}>Create {plan ? plan.rows.length : 0} matches</button></div>
    </>}
    <div className="ctrl"><button className="btn o sm danger" onClick={clear}>Remove all unplayed group matches</button></div>
  </div>
}

// ---------- Draw groups ----------
const shuffle = a => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]] } return x }
export function DrawGroups({ tm, ms, load }) {
  const [open, setOpen] = useState(false), [n, setN] = useState(2), [mode, setMode] = useState('random')
  const per = Array.from({ length: n }, (_, g) => tm.filter((_, i) => i % n === g).length).join(' / ')
  const draw = async () => {
    const existing = ms.filter(m => m.round === 'Group Stage').length
    const warn = existing ? `\n\n${existing} group match(es) already exist and keep their teams. Remove them and generate the fixtures again after drawing.` : ''
    if (!confirm(`Put ${tm.length} teams into ${n} group(s) ${mode === 'random' ? 'at random' : 'in list order'}? This replaces every team's current group.${warn}`)) return
    const order = mode === 'random' ? shuffle(tm) : [...tm]
    const rs = await Promise.all(order.map((t, i) => supabase.from('teams').update({ grp: GROUPS[i % n] }).eq('id', t.id))), er = rs.find(r => r.error)
    if (er) alert(er.error.message); else { log('Drew groups', `${tm.length} teams into ${n} group(s), ${mode}`); setOpen(false) }
    load()
  }
  return <div className="imp">
    <button className="btn o sm" onClick={() => setOpen(!open)}>{open ? 'Close draw' : 'Draw groups'}</button>
    {open && <div className="editbox">
      <p className="muted">Splits all teams of this tournament evenly over the groups. With {tm.length} teams and {n} group(s): <b>{per}</b> teams per group.</p>
      <div className="fm">
        <select value={n} onChange={e => setN(+e.target.value)}>{[1, 2, 3, 4, 5, 6].map(x => <option key={x} value={x}>{x} group{x > 1 ? 's' : ''}</option>)}</select>
        <select value={mode} onChange={e => setMode(e.target.value)}><option value="random">Random draw</option><option value="order">In list order (A, B, A, B…)</option></select>
      </div>
      <div className="ctrl"><button className="btn sm" disabled={tm.length < 2} onClick={draw}>Draw now</button></div>
    </div>}
  </div>
}

// ---------- System check: finds a missing SQL step before it bites during the event ----------
export function SystemCheck() {
  const [rows, setRows] = useState(null), [busy, setBusy] = useState(false)
  const check = async () => {
    setBusy(true); const out = [], add = (name, state, msg = '') => out.push({ name, state, msg })
    for (const tb of ['tournaments', 'teams', 'matches', 'staff', 'announcements', 'settings', 'audit_log', 'backups']) {
      const r = await supabase.from(tb).select('*').limit(1); add(`Table: ${tb}`, r.error ? 'bad' : 'ok', r.error ? r.error.message : '')
    }
    const c = await supabase.from('matches').select('scoring,locked,wo,referee,notes').limit(1)
    add('Match columns (scoring, lock, walkover, notes)', c.error ? 'bad' : 'ok', c.error ? c.error.message : '')
    const pc = await supabase.from('matches').select('points').limit(1)
    add('Point-by-point history column (points)', pc.error ? 'bad' : 'ok', pc.error ? pc.error.message : '')
    const f = await supabase.rpc('admin_reset_password', { target: '00000000-0000-0000-0000-000000000000', new_password: 'systemcheck' })
    add('Function: reset staff password', f.error && /could not find|schema cache|does not exist/i.test(f.error.message) ? 'bad' : 'ok', f.error && /could not find|schema cache|does not exist/i.test(f.error.message) ? f.error.message : '')
    const rt = await new Promise(res => {
      const ch = supabase.channel('syscheck-' + Date.now()), to = setTimeout(() => { supabase.removeChannel(ch); res(false) }, 6000)
      ch.subscribe(s => { if (s === 'SUBSCRIBED') { clearTimeout(to); supabase.removeChannel(ch); res(true) } })
    })
    add('Live updates (realtime connection)', rt ? 'ok' : 'warn', rt ? '' : 'Could not connect within 6 seconds. Check the internet connection; scores may need a manual refresh.')
    const s = await supabase.from('settings').select('id').eq('id', 'main').maybeSingle()
    add('Site settings saved', s.data ? 'ok' : 'warn', s.data ? '' : 'Nothing saved yet, defaults are in use. Open the Site panel and press Save once.')
    const a = await supabase.from('staff').select('role').eq('role', 'admin')
    add('At least one admin account', a.data && a.data.length ? 'ok' : 'bad', a.error ? a.error.message : '')
    add('Secure connection (https)', location.protocol === 'https:' || location.hostname === 'localhost' ? 'ok' : 'warn', 'Notifications and "Install app" only work over https.')
    const sw = navigator.serviceWorker ? await navigator.serviceWorker.getRegistration().catch(() => null) : null
    add('App can be installed (service worker)', sw ? 'ok' : 'warn', sw ? '' : 'Not active yet. It starts on the deployed site after the first full page load; it is off while running locally.')
    setRows(out); setBusy(false)
  }
  useEffect(() => { check() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const bad = rows ? rows.filter(r => r.state === 'bad').length : 0, warn = rows ? rows.filter(r => r.state === 'warn').length : 0
  return <div className="panel"><div className="ph"><h3>System check</h3><button className="btn o sm" disabled={busy} onClick={check}>{busy ? 'Checking…' : 'Run again'}</button></div>
    <p className="muted">Confirms that the database is fully set up for this version. Run it once after every update, and before the event starts.</p>
    {rows && <p className={bad ? 'err' : ''}><b>{bad ? `${bad} problem(s)` : warn ? `Ready, with ${warn} note(s)` : 'Everything is ready'}</b>{bad ? ' — run the latest supabase.sql in Supabase > SQL Editor, then press "Run again".' : ''}</p>}
    {rows && <div className="items">{rows.map(r => <div className="item sc" key={r.name}><span className={'dot ' + r.state}>{r.state === 'ok' ? '✓' : r.state === 'bad' ? '✕' : '!'}</span><div className="im"><b>{r.name}</b>{r.msg && <small>{r.msg}</small>}</div></div>)}</div>}
  </div>
}
