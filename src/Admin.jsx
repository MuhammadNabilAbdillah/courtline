import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { supabase, SB_URL, SB_KEY } from './supabase'
import { settle, isRace } from './score'
import { pointPatch, undoPatch, logAdd, logReset } from './engine'
import { enqueue, overlay, useOutbox, setSyncHook } from './outbox'
import { ScorerHome, SyncBadge } from './Scorer'
import { EventSettings } from './Event'
import { StandingsPanel } from './AdminRank'
import { Card } from './ui'
import { resolve } from './standings'
import { BracketView } from './Bracket'
import { emailOf, GENDERS, genderLabel, levelOptions, FORMATS, fmtOptions, fmtKey, fmtRow, clash, tn, parseTeams, fmtDate, fmtTime, activeCourts, scoreText } from './util'
import { log, mname, CourtSelect, WalkoverBox, NoteBox, Reorder, ExportPanel, HistoryPanel, SiteSettings, TimeSettings, RuleSettings, CourtsPanel, BackupPanel } from './AdminExtra'
import { DT, Overview, FixtureGenerator, DrawGroups, SystemCheck, woSets } from './AdminTools'

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F']
const ROUNDS = ['Group Stage', 'Round of 16', 'Quarterfinal', 'Semifinal', 'Third Place', 'Final']

function Login({ onBack }) {
  const [u, setU] = useState(''), [p, setP] = useState(''), [show, setShow] = useState(false), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const go = async e => {
    e.preventDefault(); setBusy(true); setErr('')
    const { error } = await supabase.auth.signInWithPassword({ email: emailOf(u), password: p })
    if (error) setErr(error.message === 'Invalid login credentials' ? 'Incorrect username or password.' : error.message)
    setBusy(false)
  }
  return <div className="login">
    <div className="lp">
      <div className="logo">Court<span>line</span></div>
      <div className="lpm"><h1>Run match day<br />with confidence.</h1><p>Schedule matches, update scores point by point and keep every court in sync — live.</p></div>
    </div>
    <form className="lf" onSubmit={go}>
      <button type="button" className="link" onClick={onBack}>← Back to scoreboard</button>
      <h2>Welcome back</h2><p className="muted">Sign in to the admin console.</p>
      <label className="fl">Username<input autoCapitalize="none" autoComplete="username" required value={u} onChange={e => setU(e.target.value)} placeholder="admin" /></label>
      <label className="fl">Password<div className="pw"><input type={show ? 'text' : 'password'} autoComplete="current-password" required value={p} onChange={e => setP(e.target.value)} placeholder="••••••••" />
        <button type="button" className="link" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button></div></label>
      {err && <div className="err">{err}</div>}
      <button className="btn big" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      <small className="muted">Authorised staff only.</small>
    </form>
  </div>
}

function EditForm({ m, tm, courts, onSave, onCancel, onDelete }) {
  const fk = fmtKey(m)
  const [f, setF] = useState({ team1: m.team1 || '', team2: m.team2 || '', round: m.round, court: m.court, start_at: m.start_at, duration: m.duration || 60, fmt: fk, golden: m.golden })
  const set = k => e => setF({ ...f, [k]: e.target.value })
  return <div className="editbox">
    <h4>Edit match</h4>
    <div className="fm">
      {['team1', 'team2'].map(k => <select key={k} value={f[k]} onChange={set(k)}><option value="">{m['slot' + k.slice(-1)] || 'TBD'}</option>{tm.map(t => <option key={t.id} value={t.id}>{tn(t)}</option>)}</select>)}
      <select value={f.round} onChange={set('round')}>{ROUNDS.map(r => <option key={r}>{r}</option>)}</select>
      <CourtSelect value={f.court} courts={courts} onChange={v => setF({ ...f, court: v })} />
      <select value={f.fmt} onChange={set('fmt')}>{fmtOptions(fk).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      {FORMATS[f.fmt].scoring !== 'race' && <select value={f.golden} onChange={e => setF({ ...f, golden: e.target.value === 'true' })}><option value="true">Golden point</option><option value="false">Advantage</option></select>}
      <select value={f.duration} onChange={set('duration')}>{[...new Set([15, 20, 25, 30, 40, 45, 60, 75, 90, 120, +f.duration].filter(Boolean))].sort((a, b) => a - b).map(x => <option key={x} value={x}>{x} min</option>)}</select>
      <div className="full"><DT value={f.start_at} onChange={v => setF({ ...f, start_at: v })} /></div>
    </div>
    <div className="ctrl"><button className="btn sm" onClick={() => onSave(f)}>Save changes</button><button className="btn o sm" onClick={onCancel}>Cancel</button><button className="btn o sm danger" onClick={onDelete}>Delete match</button></div>
  </div>
}

// Manual score correction: edit finished sets, the current game and the current points.
function ScoreEdit(props) { return isRace(props.m) ? <RaceScoreEdit {...props} /> : <TennisScoreEdit {...props} /> }

// Race to N points: just the two scores
function RaceScoreEdit({ m, onSave, onCancel }) {
  const start = m.status === 'finished' && m.sets[0] ? m.sets[0] : m.p
  const [p, setP] = useState(start.map(String))
  const names = [tn(m.t1) || 'Team A', tn(m.t2) || 'Team B']
  return <div className="editbox">
    <h4>Correct score (race to {m.target})</h4>
    <div className="se">
      <div className="sr head"><span /><b>{names[0]}</b><b>{names[1]}</b><span /></div>
      <div className="sr"><span>Points</span>{[0, 1].map(j => <input key={j} type="number" inputMode="numeric" min="0" max={m.target} value={p[j]} onChange={e => setP(p.map((x, k) => k === j ? e.target.value : x))} />)}<span /></div>
    </div>
    <p className="muted">The first team to reach {m.target} points wins. Enter {m.target} for the winner to finish the match, or lower scores to keep it live.</p>
    <div className="ctrl"><button className="btn sm" onClick={() => onSave({ race: true, p: p.map(x => Math.max(0, parseInt(x, 10) || 0)) })}>Save score</button><button className="btn o sm" onClick={onCancel}>Cancel</button></div>
  </div>
}

function TennisScoreEdit({ m, onSave, onCancel }) {
  const [sets, setSets] = useState(m.sets.map(s => [String(s[0]), String(s[1])]))
  const [g, setG] = useState(m.g.map(String)), [p, setP] = useState(m.p.map(String))
  const num = v => Math.max(0, Math.min(99, parseInt(v, 10) || 0))
  const setS = (i, j, v) => setSets(sets.map((s, k) => k === i ? s.map((x, l) => l === j ? v : x) : s))
  const names = [tn(m.t1) || 'Team A', tn(m.t2) || 'Team B']
  const two = (arr, fn) => [0, 1].map(j => <input key={j} type="number" inputMode="numeric" min="0" value={arr[j]} onChange={e => fn(j, e.target.value)} />)
  return <div className="editbox">
    <h4>Correct score</h4>
    <div className="se">
      <div className="sr head"><span /><b>{names[0]}</b><b>{names[1]}</b><span /></div>
      {sets.map((s, i) => <div className="sr" key={i}><span>Set {i + 1}</span>{two(s, (j, v) => setS(i, j, v))}
        <button className="btn o sm danger" aria-label={`Remove set ${i + 1}`} onClick={() => setSets(sets.filter((_, k) => k !== i))}>×</button></div>)}
      <div className="sr"><span>Games</span>{two(g, (j, v) => setG(g.map((x, k) => k === j ? v : x)))}<span /></div>
      <div className="sr"><span>Points</span>{two(p, (j, v) => setP(p.map((x, k) => k === j ? v : x)))}<span /></div>
    </div>
    <p className="muted">Points: 0, 1, 2, 3 = 0, 15, 30, 40 (in a tie-break, enter the real points). Games and points are cleared automatically when the sets already decide the winner.</p>
    <div className="ctrl">
      {sets.length < 5 && <button className="btn o sm" onClick={() => setSets([...sets, ['0', '0']])}>+ Add set</button>}
      <button className="btn sm" onClick={() => onSave({ sets: sets.map(s => [num(s[0]), num(s[1])]), g: g.map(num), p: p.map(num) })}>Save score</button>
      <button className="btn o sm" onClick={onCancel}>Cancel</button>
    </div>
  </div>
}

function Matches({ tm, ms, tid, admin, run, load, settings }) {
  const def = () => { const d = new Date(); d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0); return d.toISOString() }
  const courts = activeCourts(settings)
  const [mf, setMf] = useState({ team1: '', team2: '', court: courts[0] || 'Court 1', round: 'Group Stage', fmt: settings.fmt, golden: settings.golden, start_at: def(), duration: settings.duration })
  const [dl, setDl] = useState(15), [gf, setGf] = useState(settings.fmt), [editing, setEditing] = useState(null), [scoring, setScoring] = useState(null), [wob, setWob] = useState(null), [noting, setNoting] = useState(null)
  useEffect(() => { setMf(f => ({ ...f, fmt: settings.fmt, golden: settings.golden, duration: settings.duration })); setGf(settings.fmt) }, [settings.fmt, settings.golden, settings.duration])
  const hasKO = ms.some(m => m.round !== 'Group Stage')
  const upd = (m, v, act, detail) => run(supabase.from('matches').update(v).eq('id', m.id), act, detail)
  const lockOn = settings.autoLock ? { locked: true } : {}
  const diff = (m, v) => [v.court && v.court !== m.court && `court ${m.court} → ${v.court}`, v.start_at && v.start_at !== m.start_at && `time ${fmtTime(m.start_at)} → ${fmtTime(v.start_at)}`,
    v.round && v.round !== m.round && `round ${m.round} → ${v.round}`, (('team1' in v && v.team1 !== m.team1) || ('team2' in v && v.team2 !== m.team2)) && 'teams changed'].filter(Boolean).join(', ')
  const warn = (c, ex = [c.id]) => ms.filter(o => !ex.includes(o.id) && o.status !== 'finished' && clash(o, c) && (o.court === c.court || [o.team1, o.team2].some(x => x && [c.team1, c.team2].includes(x))))
  const ask = c => { const w = warn(c); return !w.length || confirm(`Clash: ${w.length} match(es) overlap on the same court or with the same team. Continue anyway?`) }

  const add = e => {
    e.preventDefault()
    if (mf.team1 === mf.team2) return alert('Pick two different teams')
    const row = { tournament_id: tid, team1: mf.team1, team2: mf.team2, court: mf.court, round: mf.round, start_at: mf.start_at, duration: +mf.duration, golden: mf.golden, ...fmtRow(mf.fmt) }
    if (ask(row)) run(supabase.from('matches').insert(row), 'Scheduled match', `${tn(tm.find(x => x.id === mf.team1))} vs ${tn(tm.find(x => x.id === mf.team2))} · ${row.court} · ${fmtTime(row.start_at)}`)
  }
  const edit = (m, v, act = 'Edited match') => { if (ask({ ...m, ...v })) upd(m, v, act, `${mname(m)}: ${diff(m, v)}`); else load() }
  const swap = async (a, b) => {
    const na = { start_at: b.start_at, court: b.court }, nb = { start_at: a.start_at, court: a.court }, w = [...warn({ ...a, ...na }, [a.id, b.id]), ...warn({ ...b, ...nb }, [a.id, b.id])]
    if (w.length && !confirm(`Clash: ${w.length} match(es) would overlap on the same court or with the same team. Continue anyway?`)) return
    const rs = await Promise.all([supabase.from('matches').update(na).eq('id', a.id), supabase.from('matches').update(nb).eq('id', b.id)]), er = rs.find(r => r.error)
    if (er) alert(er.error.message); else log('Swapped match times', `${mname(a)} ⇄ ${mname(b)}`)
    load()
  }
  const dup = async m => {
    const row = { tournament_id: m.tournament_id, court: m.court, round: m.round, start_at: new Date(+new Date(m.start_at) + (m.duration || 60) * 6e4).toISOString(), duration: m.duration || 60, golden: m.golden, best_of: m.best_of, target: m.target, scoring: m.scoring || 'tennis' }
    const { data, error } = await supabase.from('matches').insert(row).select().single()
    if (error) return alert(error.message)
    log('Duplicated match', `${mname(m)} (same rules, next time slot, teams left blank)`); await load(); pickMatch(data)
  }
  const lock = (m, on) => upd(m, { locked: on }, on ? 'Locked match' : 'Unlocked match', mname(m))
  const lockAll = async () => {
    const list = ms.filter(m => m.status === 'finished' && !m.locked)
    if (!list.length || !confirm(`Lock ${list.length} finished match(es)? Their results can no longer change until an admin unlocks them.`)) return
    const rs = await Promise.all(list.map(m => supabase.from('matches').update({ locked: true }).eq('id', m.id))), er = rs.find(r => r.error)
    if (er) alert(er.error.message); else log('Locked finished matches', `${list.length} match(es)`)
    load()
  }
  const walkover = (m, w) => {
    if (!confirm(`Record a walkover? ${tn(w ? m.t2 : m.t1)} wins.`)) return
    upd(m, { status: 'finished', winner: w ? m.team2 : m.team1, wo: true, sets: woSets(m, w), g: [0, 0], p: [0, 0], history: [...m.history.slice(-30), { sets: m.sets, g: m.g, p: m.p }], ...lockOn }, 'Walkover', `${mname(m)}: ${tn(w ? m.t2 : m.t1)} wins`)
    setWob(null)
  }
  const saveNotes = (m, v) => { upd(m, v, 'Updated referee/notes', mname(m)); setNoting(null) }
  const point = (m, t) => {
    if (m.status !== 'live') return
    const { patch, fin, sc } = pointPatch(m, t, settings.autoLock)
    enqueue(m, patch) // applied at once, sent in the background (kept on the phone if the signal drops)
    if (fin) log('Match finished', `${mname(m)}: ${sc}`)
  }
  const saveRace = (m, v) => {
    const [a, b] = v.p, hi = Math.max(a, b), done = hi === m.target, w = a > b ? 0 : 1
    if (hi > m.target) return alert(`In a race to ${m.target}, no team can have more than ${m.target} points.`)
    if (done && a === b) return alert('The scores cannot be tied at the target.')
    if (!confirm(done ? `Save the corrected score? ${tn(w ? m.t2 : m.t1)} will be the winner.` : 'Save the corrected score? The match will continue as live.')) return
    const nx = { ...m, sets: done ? [[a, b]] : [], p: done ? [0, 0] : [a, b], g: [0, 0], status: done ? 'finished' : 'live', wo: false }
    upd(m, { sets: nx.sets, g: [0, 0], p: nx.p, history: [...m.history.slice(-30), { sets: m.sets, g: m.g, p: m.p }], status: nx.status, winner: done ? (w ? m.team2 : m.team1) : null, wo: false, ...(done ? lockOn : {}), ...logAdd(m, { t: null, at: Date.now(), sc: scoreText(nx).replace('*', ''), note: 'Score corrected' }) },
      'Corrected score', `${mname(m)}: ${scoreText(m) || '0-0'} → ${scoreText(nx) || '0-0'}`)
    setScoring(null)
  }
  const saveScore = (m, v) => {
    if (v.race) return saveRace(m, v)
    const w = settle(v.sets, m.best_of), done = w !== null
    const msg = done
      ? `Save the corrected score? ${tn(w ? m.t2 : m.t1)} will be the winner.${m.status === 'finished' ? ' Knockout slots that were already filled are not changed automatically.' : ''}`
      : 'Save the corrected score? The match will continue as live.'
    if (!confirm(msg)) return
    const cur = { sets: m.sets, g: m.g, p: m.p }
    const nx = { ...m, sets: v.sets, g: done ? [0, 0] : v.g, status: done ? 'finished' : 'live', wo: false }
    upd(m, { sets: v.sets, g: nx.g, p: done ? [0, 0] : v.p, history: [...m.history.slice(-30), cur], status: nx.status, winner: done ? (w ? m.team2 : m.team1) : null, wo: false, ...(done ? lockOn : {}), ...logAdd(m, { t: null, at: Date.now(), sc: scoreText(nx).replace('*', ''), note: 'Score corrected' }) },
      'Corrected score', `${mname(m)}: ${scoreText(m) || '0-0'} → ${scoreText(nx) || '0-0'}`)
    setScoring(null)
  }
  const undo = m => { const u = undoPatch(m); if (u) { enqueue(m, u); log('Undo', mname(m)) } }
  const delay = async () => {
    const list = ms.filter(m => m.status === 'scheduled')
    if (!list.length || !confirm(`Move ${list.length} upcoming match(es) ${dl} minutes later?`)) return
    await Promise.all(list.map(m => supabase.from('matches').update({ start_at: new Date(+new Date(m.start_at) + dl * 6e4).toISOString() }).eq('id', m.id)))
    log('Delayed matches', `${list.length} match(es) +${dl} min`); load()
  }
  const save = (m, f) => {
    const v = { team1: f.team1 || null, team2: f.team2 || null, round: f.round, court: f.court, start_at: f.start_at, duration: +f.duration, golden: f.golden, ...fmtRow(f.fmt) }
    if (v.team1 && v.team1 === v.team2) return alert('Pick two different teams')
    const changed = v.team1 !== m.team1 || v.team2 !== m.team2 || v.best_of !== m.best_of || (v.target || null) !== (m.target || null) || v.scoring !== (m.scoring || 'tennis') || v.golden !== m.golden
    if (m.status !== 'scheduled' && changed) {
      if (!confirm('Changing teams or scoring rules resets the score of this match. Continue?')) return
      Object.assign(v, { status: 'scheduled', sets: [], g: [0, 0], p: [0, 0], history: [], winner: null, wo: false, ...logReset(m) })
    }
    if (!ask({ ...m, ...v })) return
    upd(m, v, 'Edited match', `${mname(m)}: ${diff(m, v) || 'rules'}${v.status === 'scheduled' && m.status !== 'scheduled' ? ' (score reset)' : ''}`); setEditing(null)
  }
  const del = m => confirm(`Delete match ${tn(m.t1) || m.slot1 || 'TBD'} vs ${tn(m.t2) || m.slot2 || 'TBD'}? This cannot be undone.`) && run(supabase.from('matches').delete().eq('id', m.id), 'Deleted match', mname(m)).then(() => setEditing(null))
  const pickMatch = m => { setEditing(m.id); setTimeout(() => document.getElementById('m-' + m.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50) }
  const genKO = () => {
    const gs = [...new Set(tm.map(t => t.grp))].sort(), c1 = courts[0] || 'Court 1', c2 = courts[1] || c1, dur = settings.duration || 30, gap = dur + 15
    const last = Math.max(Date.now(), ...ms.map(m => +new Date(m.start_at))) + gap * 6e4
    const mk = (code, round, s1, s2, i, court) => ({ tournament_id: tid, code, round, slot1: s1, slot2: s2, court, start_at: new Date(last + i * gap * 6e4).toISOString(), duration: dur, golden: settings.golden, ...fmtRow(gf) })
    let rows
    if (gs.length === 2) rows = [mk('SF1', 'Semifinal', `1st Group ${gs[0]}`, `2nd Group ${gs[1]}`, 0, c1), mk('SF2', 'Semifinal', `1st Group ${gs[1]}`, `2nd Group ${gs[0]}`, 0, c2), mk('F', 'Final', 'Winner SF1', 'Winner SF2', 1, c1), mk('TP', 'Third Place', 'Loser SF1', 'Loser SF2', 1, c2)]
    else if (gs.length === 1) rows = [mk('SF1', 'Semifinal', `1st Group ${gs[0]}`, `4th Group ${gs[0]}`, 0, c1), mk('SF2', 'Semifinal', `2nd Group ${gs[0]}`, `3rd Group ${gs[0]}`, 0, c2), mk('F', 'Final', 'Winner SF1', 'Winner SF2', 1, c1), mk('TP', 'Third Place', 'Loser SF1', 'Loser SF2', 1, c2)]
    else return alert('Auto-generate supports 1 or 2 groups. Schedule knockout matches manually instead.')
    if (confirm('Create semifinals, third place and final? Teams fill in automatically when the group stage is finished.')) run(supabase.from('matches').insert(rows), 'Created knockout stage', `${rows.length} matches`)
  }

  return <>
    <Overview ms={ms} tm={tm} />
    {admin && <FixtureGenerator tm={tm} ms={ms} tid={tid} courts={courts} settings={settings} load={load} />}
    {admin && <div className="panel"><h3>Schedule a match</h3>
      <form className="fm" onSubmit={add}>
        {['team1', 'team2'].map(k => <select key={k} required value={mf[k]} onChange={e => setMf({ ...mf, [k]: e.target.value })}>
          <option value="">{k === 'team1' ? 'Team A' : 'Team B'}</option>{tm.map(t => <option key={t.id} value={t.id}>{tn(t)}</option>)}</select>)}
        <select value={mf.round} onChange={e => setMf({ ...mf, round: e.target.value })}>{ROUNDS.map(r => <option key={r}>{r}</option>)}</select>
        <CourtSelect value={mf.court} courts={courts} onChange={v => setMf({ ...mf, court: v })} />
        <select value={mf.fmt} onChange={e => setMf({ ...mf, fmt: e.target.value })}>{fmtOptions(mf.fmt).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        {FORMATS[mf.fmt].scoring !== 'race' && <select value={mf.golden} onChange={e => setMf({ ...mf, golden: e.target.value === 'true' })}><option value="true">Golden point</option><option value="false">Advantage</option></select>}
        <select value={mf.duration} onChange={e => setMf({ ...mf, duration: e.target.value })}>{[...new Set([15, 20, 25, 30, 40, 45, 60, 75, 90, 120, +mf.duration].filter(Boolean))].sort((a, b) => a - b).map(x => <option key={x} value={x}>{x} min</option>)}</select>
        <div className="full"><DT value={mf.start_at} onChange={v => setMf({ ...mf, start_at: v })} /></div>
        <button className="btn">Schedule match</button>
      </form></div>}
    {admin && <div className="panel"><h3>Tools</h3><div className="fm">
      <select value={dl} onChange={e => setDl(+e.target.value)}>{[15, 30, 45, 60].map(x => <option key={x} value={x}>Delay {x} min</option>)}</select>
      <button className="btn o" onClick={delay}>Delay all upcoming</button>
      <button className="btn o" onClick={lockAll}>Lock all finished</button>
      {!hasKO && tm.length > 0 && <><select value={gf} onChange={e => setGf(e.target.value)}>{fmtOptions(gf).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <button className="btn" onClick={genKO}>Generate knockout</button></>}
    </div></div>}
    {admin && <Reorder ms={ms} courts={courts} edit={edit} swap={swap} />}
    {admin && hasKO && <div className="panel"><h3>Bracket</h3><BracketView matches={ms} onPick={pickMatch} title="Bracket" /></div>}
    <h3 className="sec">Match control <span className="chip">{ms.length}</span></h3>
    <div className="grid">{ms.map(m => <div key={m.id} id={'m-' + m.id}><Card m={m} plain>
      {editing === m.id ? <EditForm m={m} tm={tm} courts={courts} onSave={f => save(m, f)} onCancel={() => setEditing(null)} onDelete={() => del(m)} /> :
        scoring === m.id ? <ScoreEdit m={m} onSave={v => saveScore(m, v)} onCancel={() => setScoring(null)} /> :
        wob === m.id ? <WalkoverBox m={m} onSave={w => walkover(m, w)} onCancel={() => setWob(null)} /> :
        noting === m.id ? <NoteBox m={m} onSave={v => saveNotes(m, v)} onCancel={() => setNoting(null)} /> :
        m.locked ? <div className="ctrl"><span className="chip lock">🔒 Locked</span>
          {admin && <button className="btn o sm" onClick={() => lock(m, false)}>Unlock</button>}
          {admin && <button className="btn o sm" onClick={() => dup(m)}>Duplicate</button>}</div> :
        <div className="ctrl">
          {m.status === 'scheduled' && <button className="btn sm" onClick={() => { enqueue(m, { status: 'live' }); log('Started match', mname(m)) }} disabled={!m.team1 || !m.team2}>Start match</button>}
          {m.status === 'live' && <>
            <button className="btn sm" onClick={() => point(m, 0)}>+ {tn(m.t1)}</button>
            <button className="btn sm" onClick={() => point(m, 1)}>+ {tn(m.t2)}</button>
            <button className="btn o sm" onClick={() => undo(m)}>Undo</button></>}
          {m.status !== 'scheduled' && <button className="btn o sm" onClick={() => setScoring(m.id)}>Edit score</button>}
          {m.status !== 'finished' && <button className="btn o sm" disabled={!m.team1 || !m.team2} onClick={() => setWob(m.id)}>Walkover</button>}
          <button className="btn o sm" onClick={() => setNoting(m.id)}>Notes</button>
          {admin && m.status === 'finished' && <button className="btn o sm" onClick={() => lock(m, true)}>Lock result</button>}
          {admin && <button className="btn o sm" onClick={() => setEditing(m.id)}>Edit</button>}
          {admin && <button className="btn o sm" onClick={() => dup(m)}>Duplicate</button>}
          {admin && m.status !== 'scheduled' && <button className="btn o sm" onClick={() => confirm('Reset this match?') && upd(m, { status: 'scheduled', sets: [], g: [0, 0], p: [0, 0], history: [], winner: null, wo: false, ...logReset(m) }, 'Reset match', mname(m))}>Reset</button>}
          {admin && <button className="btn o sm danger" onClick={() => del(m)}>Delete</button>}
        </div>}
    </Card></div>)}</div>
  </>
}

// Bulk-add teams from a CSV file or cells pasted from Excel / Google Sheets.
function ImportTeams({ tm, tid, run }) {
  const [open, setOpen] = useState(false), [txt, setTxt] = useState(''), [busy, setBusy] = useState(false)
  const key = r => [r.player1, r.player2].map(x => x.trim().toLowerCase()).sort().join('|')
  const res = useMemo(() => {
    const { rows, errors } = parseTeams(txt), have = new Set(tm.map(key)), fresh = [], dup = []
    rows.forEach(r => { if (have.has(key(r))) dup.push(r); else { have.add(key(r)); fresh.push(r) } })
    return { fresh, dup, errors }
  }, [txt, tm])
  const pickFile = async e => { const f = e.target.files[0]; e.target.value = ''; if (f) setTxt(await f.text()) }
  const template = () => {
    const csv = '\uFEFFsep=;\nplayer1;player2;team name;group\nAndi;Budi;Team Elang;A\nCandra;Dewi;Team Rajawali;A\nEko;Fajar;;B\n'
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'courtline-teams-template.csv'; a.click()
  }
  const go = async () => {
    setBusy(true)
    const ok = await run(supabase.from('teams').insert(res.fresh.map(r => ({ ...r, tournament_id: tid }))), 'Imported teams', `${res.fresh.length} team(s)`)
    setBusy(false)
    if (ok) { setTxt(''); setOpen(false) }
  }
  return <div className="imp">
    <button className="btn o sm" onClick={() => setOpen(!open)}>{open ? 'Close import' : 'Import teams from CSV / Excel'}</button>
    {open && <div className="editbox">
      <p className="muted">Columns: <b>player1, player2, team name (optional), group</b>. Upload a .csv file, or copy the cells from Excel / Google Sheets and paste them below. In Excel you can also use File → Save As → CSV.</p>
      <div className="ctrl">
        <label className="btn o sm">Choose CSV file<input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" hidden onChange={pickFile} /></label>
        <button className="btn o sm" onClick={template}>Download template</button>
      </div>
      <textarea className="ta" rows={7} spellCheck={false} placeholder={'player1;player2;team name;group\nAndi;Budi;Team Elang;A'} value={txt} onChange={e => setTxt(e.target.value)} />
      {txt.trim() && <div className="imps">
        <p><b>{res.fresh.length}</b> team(s) ready to import{res.dup.length > 0 && <> · <b>{res.dup.length}</b> skipped (already exist)</>}{res.errors.length > 0 && <> · <b>{res.errors.length}</b> row(s) with problems</>}</p>
        {res.errors.length > 0 && <ul className="errs">{res.errors.slice(0, 8).map(x => <li key={x}>{x}</li>)}{res.errors.length > 8 && <li>…and {res.errors.length - 8} more</li>}</ul>}
        {res.fresh.length > 0 && <div className="scroll"><table className="tb left"><tbody>{res.fresh.slice(0, 40).map((r, i) => <tr key={i}><td><b>{r.name}</b></td><td>{r.player1} / {r.player2}</td><td>Group {r.grp}</td></tr>)}</tbody></table></div>}
        {res.fresh.length > 40 && <p className="muted">Showing the first 40 of {res.fresh.length}.</p>}
      </div>}
      <div className="ctrl"><button className="btn sm" disabled={!res.fresh.length || busy} onClick={go}>{busy ? 'Importing…' : `Import ${res.fresh.length} team(s)`}</button></div>
    </div>}
  </div>
}

function Teams({ tm, ms = [], tours, tid, run, load, settings }) {
  const blank = { name: '', player1: '', player2: '', grp: 'A' }, [tf, setTf] = useState(blank)
  const [eid, setEid] = useState(null), [ef, setEf] = useState(blank)
  const set = k => e => setTf({ ...tf, [k]: e.target.value })
  const eset = k => e => setEf({ ...ef, [k]: e.target.value })
  const others = (p1, p2, skip) => tm.filter(x => x.id !== skip && [p1, p2].some(n => [x.player1, x.player2].some(y => y.trim().toLowerCase() === n.trim().toLowerCase())))
  const withdraw = async t => {
    const list = ms.filter(m => m.status !== 'finished' && !m.locked && m.team1 && m.team2 && (m.team1 === t.id || m.team2 === t.id))
    if (!list.length) return alert(`${tn(t)} has no unplayed matches with a known opponent.`)
    if (!confirm(`Withdraw ${tn(t)}? ${list.length} unplayed match(es) will be recorded as walkover wins for their opponents. This does not delete the team.`)) return
    const rs = await Promise.all(list.map(m => { const w = m.team1 === t.id ? 1 : 0
      return supabase.from('matches').update({ status: 'finished', winner: w ? m.team2 : m.team1, wo: true, sets: woSets(m, w), g: [0, 0], p: [0, 0], history: [...(m.history || []).slice(-30), { sets: m.sets, g: m.g, p: m.p }], ...(settings.autoLock ? { locked: true } : {}) }).eq('id', m.id) })), er = rs.find(r => r.error)
    if (er) alert(er.error.message); else log('Withdrew team', `${tn(t)}: ${list.length} walkover(s)`)
    load()
  }
  const startEdit = t => { setEid(t.id); setEf({ name: t.name || '', player1: t.player1, player2: t.player2, grp: t.grp || 'A' }) }
  const saveEdit = t => {
    if (!ef.player1.trim() || !ef.player2.trim()) return alert('Both player names are required')
    run(supabase.from('teams').update({ name: ef.name.trim() || `${ef.player1.trim()} x ${ef.player2.trim()}`, player1: ef.player1.trim(), player2: ef.player2.trim(), grp: ef.grp }).eq('id', t.id), 'Edited team', ef.name.trim() || `${ef.player1.trim()} x ${ef.player2.trim()}`).then(() => setEid(null))
  }
  return <div className="panel"><h3>Teams & players</h3>
    <form className="fm" onSubmit={e => { e.preventDefault(); const dupP = others(tf.player1, tf.player2); if (dupP.length && !confirm(`A player with the same name is already in ${dupP.map(tn).join(', ')}. Add this team anyway?`)) return; run(supabase.from('teams').insert({ ...tf, name: tf.name.trim() || `${tf.player1.trim()} x ${tf.player2.trim()}`, tournament_id: tid }), 'Added team', tf.name.trim() || `${tf.player1.trim()} x ${tf.player2.trim()}`); setTf(blank) }}>
      <input required placeholder="Player 1" value={tf.player1} onChange={set('player1')} />
      <input required placeholder="Player 2" value={tf.player2} onChange={set('player2')} />
      <input placeholder="Team name (optional)" value={tf.name} onChange={set('name')} />
      <select value={tf.grp} onChange={set('grp')}>{GROUPS.map(g => <option key={g} value={g}>Group {g}</option>)}</select>
      <button className="btn">Add team</button>
    </form>
    <ImportTeams tm={tm} tid={tid} run={run} />
    <DrawGroups tm={tm} ms={ms} load={load} />
    <div className="items">{tm.map(t => eid === t.id
      ? <div className="item editing" key={t.id}>
        <div className="fm">
          <input placeholder="Team name" value={ef.name} onChange={eset('name')} />
          <input placeholder="Player 1" value={ef.player1} onChange={eset('player1')} />
          <input placeholder="Player 2" value={ef.player2} onChange={eset('player2')} />
          <select value={ef.grp} onChange={eset('grp')}>{[...new Set([...GROUPS, ef.grp])].map(g => <option key={g} value={g}>Group {g}</option>)}</select>
        </div>
        <div className="ctrl"><button className="btn sm" onClick={() => saveEdit(t)}>Save</button><button className="btn o sm" onClick={() => setEid(null)}>Cancel</button></div>
      </div>
      : <div className="item" key={t.id}>
        <div className="im"><b>{tn(t)}</b><small>{t.player1} / {t.player2}</small></div>
        <span className="chip">Group {t.grp}</span>
        <div className="ia"><button className="btn o sm" onClick={() => startEdit(t)}>Edit</button>
          <button className="btn o sm" onClick={() => withdraw(t)}>Withdraw</button>
          <button className="btn o sm danger" onClick={() => confirm('Delete team and its matches?') && run(supabase.from('teams').delete().eq('id', t.id), 'Deleted team', tn(t))}>Delete</button></div>
      </div>)}</div>
    {!tm.length && <p className="muted">No teams yet.</p>}
  </div>
}

function Tournaments({ tours, run }) {
  const blank = { name: '', gender: 'Men', level: 'Beginner', start_date: '' }, [f, setF] = useState(blank)
  const [eid, setEid] = useState(null), [ef, setEf] = useState(blank)
  const set = k => e => setF({ ...f, [k]: e.target.value })
  const eset = k => e => setEf({ ...ef, [k]: e.target.value })
  const startEdit = t => { setEid(t.id); setEf({ name: t.name, gender: t.gender, level: t.level, start_date: t.start_date || '' }) }
  const saveEdit = t => {
    if (!ef.name.trim()) return alert('Tournament name is required')
    run(supabase.from('tournaments').update({ name: ef.name.trim(), gender: ef.gender, level: ef.level, start_date: ef.start_date || null }).eq('id', t.id), 'Edited tournament', ef.name.trim()).then(() => setEid(null))
  }
  return <div className="panel"><h3>Tournaments</h3>
    <form className="fm" onSubmit={e => { e.preventDefault(); run(supabase.from('tournaments').insert({ ...f, start_date: f.start_date || null }), 'Created tournament', f.name); setF(blank) }}>
      <input required className="wide" placeholder="Tournament name, e.g. BEGINNER MEN GROUP STAGE" value={f.name} onChange={set('name')} />
      <select value={f.gender} onChange={set('gender')}>{GENDERS.map(x => <option key={x} value={x}>{genderLabel(x)}</option>)}</select>
      <select value={f.level} onChange={set('level')}>{levelOptions(f.level).map(x => <option key={x}>{x}</option>)}</select>
      <input type="date" value={f.start_date} onChange={set('start_date')} />
      <button className="btn">Create</button>
    </form>
    <div className="items">{tours.map(t => eid === t.id
      ? <div className="item editing" key={t.id}>
        <div className="fm">
          <input className="wide" placeholder="Tournament name" value={ef.name} onChange={eset('name')} />
          <select value={ef.gender} onChange={eset('gender')}>{GENDERS.map(x => <option key={x} value={x}>{genderLabel(x)}</option>)}</select>
          <select value={ef.level} onChange={eset('level')}>{levelOptions(ef.level).map(x => <option key={x}>{x}</option>)}</select>
          <input type="date" value={ef.start_date} onChange={eset('start_date')} />
        </div>
        <div className="ctrl"><button className="btn sm" onClick={() => saveEdit(t)}>Save</button><button className="btn o sm" onClick={() => setEid(null)}>Cancel</button></div>
      </div>
      : <div className="item" key={t.id}>
        <div className="im"><b>{t.name}</b><small>{genderLabel(t.gender)} · {t.level}{t.start_date ? ' · ' + t.start_date : ''}</small></div>
        <div className="ia"><button className="btn o sm" onClick={() => startEdit(t)}>Edit</button>
          <button className="btn o sm danger" onClick={() => confirm('Delete this tournament with all its teams and matches?') && run(supabase.from('tournaments').delete().eq('id', t.id), 'Deleted tournament', t.name)}>Delete</button></div>
      </div>)}</div>
  </div>
}

function Announce({ ann, run }) {
  const [f, setF] = useState({ message: '', level: 'info' })
  const add = e => {
    e.preventDefault()
    const message = f.message.trim(); if (!message) return
    run(supabase.from('announcements').insert({ message, level: f.level }), 'Posted announcement', message); setF({ message: '', level: 'info' })
  }
  return <div className="panel"><h3>Announcements</h3>
    <p className="muted">Shown as a banner at the top of every page and on the TV screen while it is visible. Viewers get a notification if they turned on "Notify me".</p>
    <form className="fm" onSubmit={add}>
      <input required className="wide" maxLength={200} placeholder="e.g. Schedule delayed 30 minutes due to rain" value={f.message} onChange={e => setF({ ...f, message: e.target.value })} />
      <select value={f.level} onChange={e => setF({ ...f, level: e.target.value })}><option value="info">Notice</option><option value="warning">Important</option></select>
      <button className="btn">Post</button>
    </form>
    <div className="items">{ann.map(a => <div className="item" key={a.id}>
      <div className="im"><b>{a.message}</b><small>{a.level === 'warning' ? 'Important' : 'Notice'} · {a.active ? 'Visible' : 'Hidden'} · {fmtDate(a.created_at)} {fmtTime(a.created_at)}</small></div>
      <div className="ia">
        <button className="btn o sm" onClick={() => run(supabase.from('announcements').update({ active: !a.active }).eq('id', a.id), a.active ? 'Hid announcement' : 'Showed announcement', a.message)}>{a.active ? 'Hide' : 'Show'}</button>
        <button className="btn o sm danger" onClick={() => confirm('Delete this announcement?') && run(supabase.from('announcements').delete().eq('id', a.id), 'Deleted announcement', a.message)}>Delete</button>
      </div></div>)}</div>
    {!ann.length && <p className="muted">No announcements yet.</p>}
  </div>
}

function Settings({ me, admin, run, load, settings, save }) {
  const [np, setNp] = useState(''), [cp, setCp] = useState(''), [staff, setStaff] = useState([]), [nf, setNf] = useState({ username: '', password: '', role: 'scorer' })
  const loadStaff = () => admin && supabase.from('staff').select('*').order('created_at').then(r => setStaff(r.data || []))
  useEffect(() => { loadStaff() }, [admin])
  const changePw = async e => {
    e.preventDefault()
    if (np.length < 6) return alert('Password must be at least 6 characters')
    if (np !== cp) return alert('Passwords do not match')
    const { error } = await supabase.auth.updateUser({ password: np })
    if (error) return alert(error.message)
    setNp(''); setCp(''); alert('Password updated')
  }
  const addUser = async e => {
    e.preventDefault()
    const tmp = createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
    const { data, error } = await tmp.auth.signUp({ email: emailOf(nf.username), password: nf.password })
    if (error) return alert(error.message)
    if (!data.user) return alert('Could not create the account')
    const r = await supabase.from('staff').insert({ user_id: data.user.id, username: nf.username.trim().toLowerCase(), role: nf.role })
    if (r.error) return alert(r.error.message)
    log('Added account', `${nf.username.trim().toLowerCase()} (${nf.role})`); setNf({ username: '', password: '', role: 'scorer' }); loadStaff()
  }
  const resetPw = async u => {
    const pw = prompt(`New password for ${u.username} (at least 6 characters):`)
    if (!pw) return
    const { error } = await supabase.rpc('admin_reset_password', { target: u.user_id, new_password: pw })
    if (error) return alert(error.message + (/function|schema cache/i.test(error.message) ? '\nRun the latest supabase.sql first.' : ''))
    log('Reset password', u.username); alert(`Password reset for ${u.username}. Give them the new password.`)
  }
  return <>
    <div className="panel"><h3>Change password</h3><p className="muted">Signed in as <b>{me.username}</b>. Pick a strong password you don't use elsewhere.</p>
      <form className="fm" onSubmit={changePw}>
        <input type="password" autoComplete="new-password" placeholder="New password" value={np} onChange={e => setNp(e.target.value)} />
        <input type="password" autoComplete="new-password" placeholder="Confirm new password" value={cp} onChange={e => setCp(e.target.value)} />
        <button className="btn">Update password</button></form></div>
    {admin && <>
      <SystemCheck />
      <SiteSettings settings={settings} save={save} />
      <EventSettings settings={settings} save={save} />
      <TimeSettings settings={settings} save={save} />
      <RuleSettings settings={settings} save={save} />
      <CourtsPanel settings={settings} save={save} />
      <div className="panel"><h3>Accounts</h3><p className="muted">Admin: full access. Scorer: can start matches, enter and correct scores, record walkovers and notes. You can change a role at any time, and reset a password if someone forgets it (it is a new password you hand over; the old one stops working).</p>
        <form className="fm" onSubmit={addUser}>
          <input required placeholder="Username" autoCapitalize="none" value={nf.username} onChange={e => setNf({ ...nf, username: e.target.value })} />
          <input required type="password" placeholder="Password (min 6)" value={nf.password} onChange={e => setNf({ ...nf, password: e.target.value })} />
          <select value={nf.role} onChange={e => setNf({ ...nf, role: e.target.value })}><option value="scorer">Scorer</option><option value="admin">Admin</option></select>
          <button className="btn">Add account</button></form>
        <div className="scroll"><table className="tb left"><tbody>{staff.map(s => <tr key={s.user_id}><td><b>{s.username}</b>{s.user_id === me.user_id && <small> (you)</small>}</td>
          <td>{s.user_id === me.user_id ? s.role : <select value={s.role} onChange={e => run(supabase.from('staff').update({ role: e.target.value }).eq('user_id', s.user_id), 'Changed role', `${s.username} → ${e.target.value}`).then(loadStaff)}><option value="scorer">scorer</option><option value="admin">admin</option></select>}</td>
          <td className="ra">{s.user_id !== me.user_id && <><button className="btn o sm" onClick={() => resetPw(s)}>Reset password</button>{' '}
            <button className="btn o sm danger" onClick={() => confirm(`Remove access for ${s.username}?`) && run(supabase.from('staff').delete().eq('user_id', s.user_id), 'Removed account', s.username).then(loadStaff)}>Remove</button></>}</td></tr>)}</tbody></table></div></div>
      <BackupPanel load={load} />
    </>}
  </>
}

export default function Admin({ matches: serverMatches, teams, tours, ann = [], settings, tid, load, onBack, onPrint }) {
  const [session, setSession] = useState(undefined), [me, setMe] = useState(null), [tab, setTab] = useState('matches'), [at, setAt] = useState('')
  const ob = useOutbox()
  const matches = useMemo(() => overlay(serverMatches, ob.items), [serverMatches, ob.items]) // this phone's not-yet-sent points shown on top
  useEffect(() => { setSyncHook(load); return () => setSyncHook(null) }, [load])
  useEffect(() => { if (me && me.role !== 'admin') setTab('scorer') }, [me && me.user_id]) // scorers land straight on the scorer screen
  useEffect(() => {
    supabase.auth.getSession().then(r => setSession(r.data.session))
    const { data } = supabase.auth.onAuthStateChange((_, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!session) return setMe(null)
    supabase.from('staff').select('*').eq('user_id', session.user.id).maybeSingle().then(r => setMe(r.data || false))
  }, [session])
  useEffect(() => { // backup fallback: if the scheduled backup could not run, an admin opening the console takes one
    if (!me || me.role !== 'admin') return
    supabase.from('backups').select('created_at').order('created_at', { ascending: false }).limit(1).then(r => {
      if (r.error) return
      const last = r.data && r.data[0] && r.data[0].created_at
      if (!last || Date.now() - +new Date(last) > 6 * 36e5) supabase.rpc('make_backup', { k: 'auto' }).then(() => {}, () => {})
    })
  }, [me && me.user_id])
  useEffect(() => { if (!tours.some(t => t.id === at)) setAt(tid !== 'all' && tours.some(t => t.id === tid) ? tid : tours[0]?.id || '') }, [tours, tid])
  // Fill knockout slots ("1st Group A", "Winner SF1") with real teams once they are decided
  useEffect(() => {
    if (!me) return
    const ups = []
    tours.forEach(t => {
      const tm = teams.filter(x => x.tournament_id === t.id), ms = matches.filter(x => x.tournament_id === t.id)
      ms.forEach(m => [1, 2].forEach(k => {
        if (!m['team' + k] && m['slot' + k]) { const id = resolve(m['slot' + k], tm, ms); if (id) ups.push([m.id, { ['team' + k]: id }]) }
      }))
    })
    if (ups.length) Promise.all(ups.map(([id, v]) => supabase.from('matches').update(v).eq('id', id))).then(load)
  }, [matches, teams, me])

  if (session === undefined) return null
  if (!session) return <Login onBack={onBack} />
  if (me === null) return <p className="muted">Loading…</p>
  if (me === false) return <div className="empty">This account has no staff access.<br /><button className="btn" onClick={() => supabase.auth.signOut()}>Sign out</button></div>
  const admin = me.role === 'admin'
  const run = async (p, act, detail) => { const { error } = await p; if (error) alert(error.message); else if (act) log(act, detail); load(); return !error }
  const save = async (patch, act, detail) => {
    const { error } = await supabase.from('settings').upsert({ id: 'main', data: { ...settings, ...patch }, updated_at: new Date().toISOString() })
    if (error) { alert(error.message + (/relation|schema cache/i.test(error.message) ? '\nRun the latest supabase.sql in Supabase first.' : '')); return false }
    log(act || 'Updated settings', detail); load(); return true
  }
  const tm = teams.filter(x => x.tournament_id === at), ms = matches.filter(x => x.tournament_id === at)
  const tabs = [['scorer', 'Scorer'], ['matches', 'Matches'], ...(admin ? [['teams', 'Teams'], ['standings', 'Standings'], ['tournaments', 'Tournaments'], ['announcements', 'Announcements'], ['export', 'Export'], ['history', 'History']] : []), ['settings', 'Settings']]
  const needT = (tab === 'matches' || tab === 'teams') && !at
  return <div className="adm">
    <div className="ah"><div><h2>Admin console</h2><span className="muted">{me.username} · {me.role}</span></div><div className="ctrl"><SyncBadge /><button className="btn o sm" onClick={() => supabase.auth.signOut()}>Sign out</button></div></div>
    <div className="subnav">{tabs.map(([k, v]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{v}</button>)}</div>
    {(tab === 'matches' || tab === 'teams') && tours.length > 0 && <div className="tools"><select value={at} onChange={e => setAt(e.target.value)}>{tours.map(t => <option key={t.id} value={t.id}>{t.name} · {genderLabel(t.gender)} {t.level}</option>)}</select></div>}
    {needT && <div className="empty">Create a tournament first{admin ? ' in the Tournaments tab.' : '.'}</div>}
    {tab === 'scorer' && <ScorerHome matches={matches} settings={settings} />}
    {tab === 'standings' && admin && <StandingsPanel tours={tours} teams={teams} matches={matches} settings={settings} save={save} />}
    {tab === 'matches' && !needT && <Matches tm={tm} ms={ms} tid={at} admin={admin} run={run} load={load} settings={settings} />}
    {tab === 'teams' && admin && !needT && <Teams tm={tm} ms={ms} tours={tours} tid={at} run={run} load={load} settings={settings} />}
    {tab === 'tournaments' && admin && <Tournaments tours={tours} run={run} />}
    {tab === 'announcements' && admin && <Announce ann={ann} run={run} />}
    {tab === 'export' && admin && <ExportPanel tours={tours} teams={teams} matches={matches} at={at} onPrint={onPrint} />}
    {tab === 'history' && admin && <HistoryPanel />}
    {tab === 'settings' && <Settings me={me} admin={admin} run={run} load={load} settings={settings} save={save} />}
  </div>
}
