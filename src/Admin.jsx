import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { supabase, SB_URL, SB_KEY } from './supabase'
import { addPoint } from './score'
import { Card } from './ui'
import { resolve } from './standings'
import { BracketView } from './Bracket'
import { toLocal, fromLocal, emailOf, GENDERS, LEVELS, FORMATS, clash, tn } from './util'

const HH = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MM = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))
const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F']
const ROUNDS = ['Group Stage', 'Round of 16', 'Quarterfinal', 'Semifinal', 'Third Place', 'Final']

// Date + 24h time picker (5-minute steps), always in WITA
function DT({ value, onChange }) {
  const l = toLocal(value), d = l.slice(0, 10), h = l.slice(11, 13), m = l.slice(14, 16)
  const set = (a, b, c) => a && onChange(fromLocal(`${a}T${b}:${c}`))
  return <div className="dt">
    <input type="date" value={d} onChange={e => set(e.target.value, h, m)} />
    <div className="tp">
      <select value={h} onChange={e => set(d, e.target.value, m)}>{HH.map(x => <option key={x}>{x}</option>)}</select><b>:</b>
      <select value={m} onChange={e => set(d, h, e.target.value)}>{[...new Set([...MM, m])].sort().map(x => <option key={x}>{x}</option>)}</select>
      <small>WITA</small>
    </div>
  </div>
}

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

function EditForm({ m, tm, onSave, onCancel, onDelete }) {
  const fk = Object.keys(FORMATS).find(k => FORMATS[k].best_of === m.best_of && FORMATS[k].target === (m.target || null)) || 'bo3'
  const [f, setF] = useState({ team1: m.team1 || '', team2: m.team2 || '', round: m.round, court: m.court, start_at: m.start_at, duration: m.duration || 60, fmt: fk, golden: m.golden })
  const set = k => e => setF({ ...f, [k]: e.target.value })
  return <div className="editbox">
    <h4>Edit match</h4>
    <div className="fm">
      {['team1', 'team2'].map(k => <select key={k} value={f[k]} onChange={set(k)}><option value="">{m['slot' + k.slice(-1)] || 'TBD'}</option>{tm.map(t => <option key={t.id} value={t.id}>{tn(t)}</option>)}</select>)}
      <select value={f.round} onChange={set('round')}>{ROUNDS.map(r => <option key={r}>{r}</option>)}</select>
      <input list="courts" value={f.court} onChange={set('court')} placeholder="Court" />
      <select value={f.fmt} onChange={set('fmt')}>{Object.entries(FORMATS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
      <select value={f.golden} onChange={e => setF({ ...f, golden: e.target.value === 'true' })}><option value="true">Golden point</option><option value="false">Advantage</option></select>
      <select value={f.duration} onChange={set('duration')}>{[30, 45, 60, 75, 90, 120].map(x => <option key={x} value={x}>{x} min</option>)}</select>
      <div className="full"><DT value={f.start_at} onChange={v => setF({ ...f, start_at: v })} /></div>
    </div>
    <div className="ctrl"><button className="btn sm" onClick={() => onSave(f)}>Save changes</button><button className="btn o sm" onClick={onCancel}>Cancel</button><button className="btn o sm danger" onClick={onDelete}>Delete match</button></div>
  </div>
}

function Matches({ tm, ms, tid, admin, run, load }) {
  const def = () => { const d = new Date(); d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0); return d.toISOString() }
  const [mf, setMf] = useState({ team1: '', team2: '', court: 'Court 1', round: 'Group Stage', fmt: 'bo3', golden: true, start_at: def(), duration: 60 })
  const [dl, setDl] = useState(15), [gf, setGf] = useState('bo3'), [editing, setEditing] = useState(null)
  const courts = [...new Set(['Court 1', 'Court 2', 'Court 3', 'Court 4', ...ms.map(m => m.court)])]
  const hasKO = ms.some(m => m.round !== 'Group Stage')
  const upd = (m, v) => run(supabase.from('matches').update(v).eq('id', m.id))
  const warn = c => ms.filter(o => o.id !== c.id && o.status !== 'finished' && clash(o, c) && (o.court === c.court || [o.team1, o.team2].some(x => x && [c.team1, c.team2].includes(x))))
  const ask = c => { const w = warn(c); return !w.length || confirm(`Clash: ${w.length} match(es) overlap on the same court or with the same team. Continue anyway?`) }

  const add = e => {
    e.preventDefault()
    if (mf.team1 === mf.team2) return alert('Pick two different teams')
    const F = FORMATS[mf.fmt]
    const row = { tournament_id: tid, team1: mf.team1, team2: mf.team2, court: mf.court, round: mf.round, start_at: mf.start_at, duration: +mf.duration, golden: mf.golden, best_of: F.best_of, target: F.target }
    if (ask(row)) run(supabase.from('matches').insert(row))
  }
  const edit = (m, v) => { if (ask({ ...m, ...v })) upd(m, v); else load() }
  const point = (m, t) => {
    if (m.status !== 'live') return
    const cur = { sets: m.sets, g: m.g, p: m.p }, n = addPoint(cur, t, m.golden, m.best_of, m.target)
    upd(m, { sets: n.sets, g: n.g, p: n.p, history: [...m.history.slice(-30), cur], status: n.winner === null ? 'live' : 'finished', winner: n.winner === null ? null : (n.winner ? m.team2 : m.team1) })
  }
  const undo = m => { const h = [...m.history], prev = h.pop(); if (prev) upd(m, { ...prev, history: h, status: 'live', winner: null }) }
  const delay = async () => {
    const list = ms.filter(m => m.status === 'scheduled')
    if (!list.length || !confirm(`Move ${list.length} upcoming match(es) ${dl} minutes later?`)) return
    await Promise.all(list.map(m => supabase.from('matches').update({ start_at: new Date(+new Date(m.start_at) + dl * 6e4).toISOString() }).eq('id', m.id)))
    load()
  }
  const save = (m, f) => {
    const F = FORMATS[f.fmt], v = { team1: f.team1 || null, team2: f.team2 || null, round: f.round, court: f.court, start_at: f.start_at, duration: +f.duration, golden: f.golden, best_of: F.best_of, target: F.target }
    if (v.team1 && v.team1 === v.team2) return alert('Pick two different teams')
    const changed = v.team1 !== m.team1 || v.team2 !== m.team2 || v.best_of !== m.best_of || (v.target || null) !== (m.target || null) || v.golden !== m.golden
    if (m.status !== 'scheduled' && changed) {
      if (!confirm('Changing teams or scoring rules resets the score of this match. Continue?')) return
      Object.assign(v, { status: 'scheduled', sets: [], g: [0, 0], p: [0, 0], history: [], winner: null })
    }
    if (!ask({ ...m, ...v })) return
    upd(m, v); setEditing(null)
  }
  const del = m => confirm(`Delete match ${tn(m.t1) || m.slot1 || 'TBD'} vs ${tn(m.t2) || m.slot2 || 'TBD'}? This cannot be undone.`) && run(supabase.from('matches').delete().eq('id', m.id)).then(() => setEditing(null))
  const pickMatch = m => { setEditing(m.id); setTimeout(() => document.getElementById('m-' + m.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50) }
  const genKO = () => {
    const gs = [...new Set(tm.map(t => t.grp))].sort(), F = FORMATS[gf]
    const last = Math.max(Date.now(), ...ms.map(m => +new Date(m.start_at))) + 90 * 6e4
    const mk = (code, round, s1, s2, i, court) => ({ tournament_id: tid, code, round, slot1: s1, slot2: s2, court, start_at: new Date(last + i * 90 * 6e4).toISOString(), best_of: F.best_of, target: F.target })
    let rows
    if (gs.length === 2) rows = [mk('SF1', 'Semifinal', `1st Group ${gs[0]}`, `2nd Group ${gs[1]}`, 0, 'Court 1'), mk('SF2', 'Semifinal', `1st Group ${gs[1]}`, `2nd Group ${gs[0]}`, 0, 'Court 2'), mk('F', 'Final', 'Winner SF1', 'Winner SF2', 1, 'Court 1'), mk('TP', 'Third Place', 'Loser SF1', 'Loser SF2', 1, 'Court 2')]
    else if (gs.length === 1) rows = [mk('SF1', 'Semifinal', `1st Group ${gs[0]}`, `4th Group ${gs[0]}`, 0, 'Court 1'), mk('SF2', 'Semifinal', `2nd Group ${gs[0]}`, `3rd Group ${gs[0]}`, 0, 'Court 2'), mk('F', 'Final', 'Winner SF1', 'Winner SF2', 1, 'Court 1'), mk('TP', 'Third Place', 'Loser SF1', 'Loser SF2', 1, 'Court 2')]
    else return alert('Auto-generate supports 1 or 2 groups. Schedule knockout matches manually instead.')
    if (confirm('Create semifinals, third place and final? Teams fill in automatically when the group stage is finished.')) run(supabase.from('matches').insert(rows))
  }

  return <>
    {admin && <div className="panel"><h3>Schedule a match</h3>
      <form className="fm" onSubmit={add}>
        {['team1', 'team2'].map(k => <select key={k} required value={mf[k]} onChange={e => setMf({ ...mf, [k]: e.target.value })}>
          <option value="">{k === 'team1' ? 'Team A' : 'Team B'}</option>{tm.map(t => <option key={t.id} value={t.id}>{tn(t)}</option>)}</select>)}
        <select value={mf.round} onChange={e => setMf({ ...mf, round: e.target.value })}>{ROUNDS.map(r => <option key={r}>{r}</option>)}</select>
        <input list="courts" value={mf.court} onChange={e => setMf({ ...mf, court: e.target.value })} placeholder="Court" />
        <datalist id="courts">{courts.map(c => <option key={c} value={c} />)}</datalist>
        <select value={mf.fmt} onChange={e => setMf({ ...mf, fmt: e.target.value })}>{Object.entries(FORMATS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <select value={mf.golden} onChange={e => setMf({ ...mf, golden: e.target.value === 'true' })}><option value="true">Golden point</option><option value="false">Advantage</option></select>
        <select value={mf.duration} onChange={e => setMf({ ...mf, duration: e.target.value })}>{[30, 45, 60, 75, 90, 120].map(x => <option key={x} value={x}>{x} min</option>)}</select>
        <div className="full"><DT value={mf.start_at} onChange={v => setMf({ ...mf, start_at: v })} /></div>
        <button className="btn">Schedule match</button>
      </form></div>}
    {admin && <div className="panel"><h3>Tools</h3><div className="fm">
      <select value={dl} onChange={e => setDl(+e.target.value)}>{[15, 30, 45, 60].map(x => <option key={x} value={x}>Delay {x} min</option>)}</select>
      <button className="btn o" onClick={delay}>Delay all upcoming</button>
      {!hasKO && tm.length > 0 && <><select value={gf} onChange={e => setGf(e.target.value)}>{Object.entries(FORMATS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <button className="btn" onClick={genKO}>Generate knockout</button></>}
    </div></div>}
    {admin && hasKO && <div className="panel"><h3>Bracket</h3><BracketView matches={ms} onPick={pickMatch} title="Bracket" /></div>}
    <h3 className="sec">Match control <span className="chip">{ms.length}</span></h3>
    <div className="grid">{ms.map(m => <div key={m.id} id={'m-' + m.id}><Card m={m}>
      {editing === m.id ? <EditForm m={m} tm={tm} onSave={f => save(m, f)} onCancel={() => setEditing(null)} onDelete={() => del(m)} /> :
        <div className="ctrl">
          {m.status === 'scheduled' && <button className="btn sm" onClick={() => upd(m, { status: 'live' })} disabled={!m.team1 || !m.team2}>Start match</button>}
          {m.status === 'live' && <>
            <button className="btn sm" onClick={() => point(m, 0)}>+ {tn(m.t1)}</button>
            <button className="btn sm" onClick={() => point(m, 1)}>+ {tn(m.t2)}</button>
            <button className="btn o sm" onClick={() => undo(m)}>Undo</button></>}
          {admin && <button className="btn o sm" onClick={() => setEditing(m.id)}>Edit</button>}
          {admin && m.status !== 'scheduled' && <button className="btn o sm" onClick={() => confirm('Reset this match?') && upd(m, { status: 'scheduled', sets: [], g: [0, 0], p: [0, 0], history: [], winner: null })}>Reset</button>}
          {admin && <button className="btn o sm danger" onClick={() => del(m)}>Delete</button>}
        </div>}
    </Card></div>)}</div>
  </>
}

function Teams({ tm, tours, tid, run }) {
  const blank = { name: '', player1: '', player2: '', grp: 'A' }, [tf, setTf] = useState(blank)
  const [eid, setEid] = useState(null), [ef, setEf] = useState(blank)
  const set = k => e => setTf({ ...tf, [k]: e.target.value })
  const eset = k => e => setEf({ ...ef, [k]: e.target.value })
  const startEdit = t => { setEid(t.id); setEf({ name: t.name || '', player1: t.player1, player2: t.player2, grp: t.grp || 'A' }) }
  const saveEdit = t => {
    if (!ef.player1.trim() || !ef.player2.trim()) return alert('Both player names are required')
    run(supabase.from('teams').update({ name: ef.name.trim() || `${ef.player1.trim()} x ${ef.player2.trim()}`, player1: ef.player1.trim(), player2: ef.player2.trim(), grp: ef.grp }).eq('id', t.id)).then(() => setEid(null))
  }
  return <div className="panel"><h3>Teams & players</h3>
    <form className="fm" onSubmit={e => { e.preventDefault(); run(supabase.from('teams').insert({ ...tf, name: tf.name.trim() || `${tf.player1.trim()} x ${tf.player2.trim()}`, tournament_id: tid })); setTf(blank) }}>
      <input required placeholder="Player 1" value={tf.player1} onChange={set('player1')} />
      <input required placeholder="Player 2" value={tf.player2} onChange={set('player2')} />
      <input placeholder="Team name (optional)" value={tf.name} onChange={set('name')} />
      <select value={tf.grp} onChange={set('grp')}>{GROUPS.map(g => <option key={g} value={g}>Group {g}</option>)}</select>
      <button className="btn">Add team</button>
    </form>
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
          <button className="btn o sm danger" onClick={() => confirm('Delete team and its matches?') && run(supabase.from('teams').delete().eq('id', t.id))}>Delete</button></div>
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
    run(supabase.from('tournaments').update({ name: ef.name.trim(), gender: ef.gender, level: ef.level, start_date: ef.start_date || null }).eq('id', t.id)).then(() => setEid(null))
  }
  return <div className="panel"><h3>Tournaments</h3>
    <form className="fm" onSubmit={e => { e.preventDefault(); run(supabase.from('tournaments').insert({ ...f, start_date: f.start_date || null })); setF(blank) }}>
      <input required className="wide" placeholder="Tournament name, e.g. BEGINNER MEN GROUP STAGE" value={f.name} onChange={set('name')} />
      <select value={f.gender} onChange={set('gender')}>{GENDERS.map(x => <option key={x}>{x}</option>)}</select>
      <select value={f.level} onChange={set('level')}>{LEVELS.map(x => <option key={x}>{x}</option>)}</select>
      <input type="date" value={f.start_date} onChange={set('start_date')} />
      <button className="btn">Create</button>
    </form>
    <div className="items">{tours.map(t => eid === t.id
      ? <div className="item editing" key={t.id}>
        <div className="fm">
          <input className="wide" placeholder="Tournament name" value={ef.name} onChange={eset('name')} />
          <select value={ef.gender} onChange={eset('gender')}>{GENDERS.map(x => <option key={x}>{x}</option>)}</select>
          <select value={ef.level} onChange={eset('level')}>{LEVELS.map(x => <option key={x}>{x}</option>)}</select>
          <input type="date" value={ef.start_date} onChange={eset('start_date')} />
        </div>
        <div className="ctrl"><button className="btn sm" onClick={() => saveEdit(t)}>Save</button><button className="btn o sm" onClick={() => setEid(null)}>Cancel</button></div>
      </div>
      : <div className="item" key={t.id}>
        <div className="im"><b>{t.name}</b><small>{t.gender} · {t.level}{t.start_date ? ' · ' + t.start_date : ''}</small></div>
        <div className="ia"><button className="btn o sm" onClick={() => startEdit(t)}>Edit</button>
          <button className="btn o sm danger" onClick={() => confirm('Delete this tournament with all its teams and matches?') && run(supabase.from('tournaments').delete().eq('id', t.id))}>Delete</button></div>
      </div>)}</div>
  </div>
}

function Settings({ me, admin, run, load }) {
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
    setNf({ username: '', password: '', role: 'scorer' }); loadStaff()
  }
  const backup = async () => {
    const [a, b, c] = await Promise.all(['tournaments', 'teams', 'matches'].map(t => supabase.from(t).select('*')))
    const blob = new Blob([JSON.stringify({ app: 'courtline', exported_at: new Date().toISOString(), tournaments: a.data, teams: b.data, matches: c.data }, null, 2)], { type: 'application/json' })
    const el = document.createElement('a'); el.href = URL.createObjectURL(blob)
    el.download = `courtline-backup-${new Date().toISOString().slice(0, 10)}.json`; el.click()
  }
  const restore = async e => {
    const file = e.target.files[0]; e.target.value = ''
    if (!file || !confirm('Restore this backup? Records with the same ID will be overwritten.')) return
    try {
      const d = JSON.parse(await file.text())
      if (d.app !== 'courtline') throw new Error('This is not a Courtline backup file')
      for (const [t, rows] of [['tournaments', d.tournaments || []], ['teams', d.teams || []], ['matches', d.matches || []]]) {
        if (!rows.length) continue
        const r = await supabase.from(t).upsert(rows); if (r.error) throw r.error
      }
      alert('Backup restored'); load()
    } catch (x) { alert(x.message) }
  }
  return <>
    <div className="panel"><h3>Change password</h3><p className="muted">Signed in as <b>{me.username}</b>. Pick a strong password you don't use elsewhere.</p>
      <form className="fm" onSubmit={changePw}>
        <input type="password" autoComplete="new-password" placeholder="New password" value={np} onChange={e => setNp(e.target.value)} />
        <input type="password" autoComplete="new-password" placeholder="Confirm new password" value={cp} onChange={e => setCp(e.target.value)} />
        <button className="btn">Update password</button></form></div>
    {admin && <>
      <div className="panel"><h3>Accounts</h3><p className="muted">Admin: full access. Scorer: can start matches and enter scores only.</p>
        <form className="fm" onSubmit={addUser}>
          <input required placeholder="Username" autoCapitalize="none" value={nf.username} onChange={e => setNf({ ...nf, username: e.target.value })} />
          <input required type="password" placeholder="Password (min 6)" value={nf.password} onChange={e => setNf({ ...nf, password: e.target.value })} />
          <select value={nf.role} onChange={e => setNf({ ...nf, role: e.target.value })}><option value="scorer">Scorer</option><option value="admin">Admin</option></select>
          <button className="btn">Add account</button></form>
        <div className="scroll"><table className="tb left"><tbody>{staff.map(s => <tr key={s.user_id}><td><b>{s.username}</b></td><td>{s.role}</td>
          <td>{s.user_id !== me.user_id && <button className="btn o sm" onClick={() => confirm(`Remove access for ${s.username}?`) && run(supabase.from('staff').delete().eq('user_id', s.user_id)).then(loadStaff)}>Remove</button>}</td></tr>)}</tbody></table></div></div>
      <div className="panel"><h3>Data backup</h3><p className="muted">Download all tournaments, teams and matches as a file, or restore from a previous backup.</p>
        <div className="fm"><button className="btn" onClick={backup}>Download backup</button>
          <label className="btn o">Restore from file<input type="file" accept="application/json" hidden onChange={restore} /></label></div></div>
    </>}
  </>
}

export default function Admin({ matches, teams, tours, tid, load, onBack }) {
  const [session, setSession] = useState(undefined), [me, setMe] = useState(null), [tab, setTab] = useState('matches'), [at, setAt] = useState('')
  useEffect(() => {
    supabase.auth.getSession().then(r => setSession(r.data.session))
    const { data } = supabase.auth.onAuthStateChange((_, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!session) return setMe(null)
    supabase.from('staff').select('*').eq('user_id', session.user.id).maybeSingle().then(r => setMe(r.data || false))
  }, [session])
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
  const run = async p => { const { error } = await p; if (error) alert(error.message); load() }
  const tm = teams.filter(x => x.tournament_id === at), ms = matches.filter(x => x.tournament_id === at)
  const tabs = [['matches', 'Matches'], ...(admin ? [['teams', 'Teams'], ['tournaments', 'Tournaments']] : []), ['settings', 'Settings']]
  const needT = (tab === 'matches' || tab === 'teams') && !at
  return <div className="adm">
    <div className="ah"><div><h2>Admin console</h2><span className="muted">{me.username} · {me.role}</span></div><button className="btn o sm" onClick={() => supabase.auth.signOut()}>Sign out</button></div>
    <div className="subnav">{tabs.map(([k, v]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{v}</button>)}</div>
    {(tab === 'matches' || tab === 'teams') && tours.length > 0 && <div className="tools"><select value={at} onChange={e => setAt(e.target.value)}>{tours.map(t => <option key={t.id} value={t.id}>{t.name} · {t.gender} {t.level}</option>)}</select></div>}
    {needT && <div className="empty">Create a tournament first{admin ? ' in the Tournaments tab.' : '.'}</div>}
    {tab === 'matches' && !needT && <Matches tm={tm} ms={ms} tid={at} admin={admin} run={run} load={load} />}
    {tab === 'teams' && admin && !needT && <Teams tm={tm} tours={tours} tid={at} run={run} />}
    {tab === 'tournaments' && admin && <Tournaments tours={tours} run={run} />}
    {tab === 'settings' && <Settings me={me} admin={admin} run={run} load={load} />}
  </div>
}
