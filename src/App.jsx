import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from './supabase'
import { Card, Clock } from './ui'
import { label } from './score'
import { fmtDay, fmtTime, fmtDate, ini, share, tn, rule } from './util'
import { table } from './standings'
import { BracketView, virtualKO } from './Bracket'
import Admin from './Admin'

const Q = '*, t1:teams!matches_team1_fkey(*), t2:teams!matches_team2_fkey(*)'
const ICONS = {
  live: <><circle cx="12" cy="12" r="3" /><path d="M6.3 6.3a8 8 0 000 11.4M17.7 6.3a8 8 0 010 11.4" /></>,
  schedule: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
  bracket: <path d="M4 5h5v4H4zM4 15h5v4H4zM15 10h5v4h-5zM9 7h3v10H9M12 12h3" />,
  results: <path d="M8 4h8v5a4 4 0 01-8 0zM8 6H4v1a3 3 0 003 3M16 6h4v1a3 3 0 01-3 3M12 13v4M8 20h8" />,
  tv: <><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 21h8M12 17v4" /></>,
  admin: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></>
}
const TABS = [['live', 'Live'], ['schedule', 'Schedule'], ['bracket', 'Bracket'], ['results', 'Results'], ['tv', 'TV'], ['admin', 'Admin']]
const Ico = ({ k }) => <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{ICONS[k]}</svg>

function useData() {
  const [matches, setM] = useState([]), [teams, setT] = useState([]), [tours, setTo] = useState([]), mref = useRef([])
  mref.current = matches
  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      supabase.from('matches').select(Q).order('start_at'),
      supabase.from('teams').select('*').order('name'),
      supabase.from('tournaments').select('*').order('created_at')])
    setM(a.data || []); setT(b.data || []); setTo(c.data || [])
  }, [])
  useEffect(() => {
    load()
    const ch = supabase.channel('rt').on('postgres_changes', { event: '*', schema: 'public' }, p => {
      if (p.table === 'matches' && p.eventType === 'UPDATE') {
        const old = mref.current.find(x => x.id === p.new.id)
        if (old && old.status !== 'live' && p.new.status === 'live' && window.Notification?.permission === 'granted')
          new Notification('Match started', { body: `${tn(old.t1) || 'TBD'} vs ${tn(old.t2) || 'TBD'} · ${old.court}` })
        if (old && old.team1 === p.new.team1 && old.team2 === p.new.team2) return setM(ms => ms.map(x => x.id === p.new.id ? { ...x, ...p.new } : x))
      }
      load()
    }).subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])
  return { matches, teams, tours, load }
}

function Banner({ one, matches, teams }) {
  const live = matches.filter(m => m.status === 'live').length, today = matches.filter(m => fmtDay(m.start_at) === fmtDay(new Date())).length
  const ko = matches.some(m => m.round !== 'Group Stage')
  return <section className="banner">
    <div>
      <small>{one ? `${one.gender} · ${one.level}` : 'ALL TOURNAMENTS'}</small>
      <h1>{one ? one.name : 'Padel live scores'}</h1>
      <div className="tmeta">{one && <><span>{ko ? 'Knockout Stage' : 'Group Stage'}</span>{one.start_date && <span>{fmtDate(one.start_date)}</span>}</>}<span>All times in WITA</span></div>
    </div>
    <div className="bst"><div><b>{live}</b><span>Live</span></div><div><b>{today}</b><span>Today</span></div><div><b>{teams.length}</b><span>Teams</span></div></div>
  </section>
}

function Feature({ m }) {
  const n = m.sets.length + 1, cols = { gridTemplateColumns: '1fr' + ' 3.75rem'.repeat(n) }
  const team = (t, slot, i) => <div className={'tmx' + (i ? ' r' : '')}><div className="av">{ini(tn(t) || slot)}</div><div><h3>{tn(t) || slot || 'TBD'}</h3><small>{t ? `${t.player1} / ${t.player2}` : ''}</small></div></div>
  return <div className="feature">
    <div className="fh"><span className="badge live">LIVE</span><span>{m.tname ? m.tname + ' · ' : ''}{m.court} · {m.round} · {rule(m)} · {m.golden ? 'Golden point' : 'Advantage'}</span><button className="btn g sm" onClick={() => share(m)}>Share</button></div>
    <div className="sb">{team(m.t1, m.slot1, 0)}
      <div><div className="lbl">CURRENT GAME</div><div className="pts"><b>{label(m.p, 0, m.g, m.golden, m.target)}</b><span>:</span><b className="dim">{label(m.p, 1, m.g, m.golden, m.target)}</b></div></div>
      {team(m.t2, m.slot2, 1)}</div>
    <div className="scroll"><div className="tbl" style={cols}>
      <div className="h">TEAM</div>{m.sets.map((_, k) => <div key={k} className="h c">SET {k + 1}</div>)}<div className="h c">GAME</div>
      {[[m.t1, m.slot1, 0], [m.t2, m.slot2, 1]].map(([t, s, i]) => [<div key={'n' + i}>{tn(t) || s}</div>, ...m.sets.map((x, k) => <div key={k} className="c">{x[i]}</div>), <div key={'g' + i} className="c on">{m.g[i]}</div>])}
    </div></div>
  </div>
}

function Courts({ matches }) {
  const names = [...new Set(matches.map(m => m.court))].sort()
  if (!names.length) return null
  return <><h3 className="sec">Court status</h3><div className="courts">{names.map(c => {
    const l = matches.find(m => m.court === c && m.status === 'live'), n = matches.find(m => m.court === c && m.status === 'scheduled')
    return <div key={c} className={'ct' + (l ? ' on' : '')}><b>{c}</b><p>{l ? `${l.round} · live` : n ? `Next ${fmtTime(n.start_at)}` : 'Free'}</p></div>
  })}</div></>
}

function Live({ matches }) {
  const live = matches.filter(m => m.status === 'live'), next = matches.filter(m => m.status === 'scheduled').slice(0, 4)
  return <>
    {live[0] && <Feature m={live[0]} />}
    <h3 className="sec">Live now <span className="chip">{live.length}</span></h3>
    {live.length ? <div className="grid">{live.map(m => <Card key={m.id} m={m} />)}</div> : <div className="empty">No matches are live right now.</div>}
    <Courts matches={matches} />
    {next.length > 0 && <><h3 className="sec">Up next</h3><div className="grid">{next.map(m => <Card key={m.id} m={m} />)}</div></>}
  </>
}

function Schedule({ matches }) {
  const [q, setQ] = useState('')
  const list = matches.filter(m => m.status !== 'finished' &&
    (tn(m.t1) + tn(m.t2) + m.t1?.player1 + m.t1?.player2 + m.t2?.player1 + m.t2?.player2 + m.court + m.round).toLowerCase().includes(q.toLowerCase()))
  const days = [...new Set(list.map(m => fmtDay(m.start_at)))]
  return <>
    <h3 className="sec">Schedule <span className="chip">WITA</span></h3>
    <input className="search" placeholder="Search team, player, court or round…" value={q} onChange={e => setQ(e.target.value)} />
    {days.length ? days.map(d => <div key={d}><div className="day">{d}</div><div className="card list">
      {list.filter(m => fmtDay(m.start_at) === d).map(m => <div className="srow" key={m.id}>
        <div className="st"><b>{fmtTime(m.start_at)}</b><small>{m.court}</small></div>
        <div className="sm"><b>{tn(m.t1) || m.slot1 || 'TBD'}</b> <span>vs</span> <b>{tn(m.t2) || m.slot2 || 'TBD'}</b>
          <small>{m.round}{m.tname ? ` · ${m.tname}` : ''} · {rule(m)}</small></div>
        <span className={'badge ' + (m.status === 'live' ? 'live' : '')}>{m.status === 'live' ? 'LIVE' : 'UPCOMING'}</span></div>)}
    </div></div>) : <div className="empty">No scheduled matches.</div>}
  </>
}

function GroupTable({ g, teams, matches }) {
  const rows = table(teams.filter(t => t.grp === g), matches)
  return <div className="gt"><h3>Group {g}</h3><div className="scroll"><table className="tb">
    <thead><tr><th>TEAM</th><th>G</th><th>W-L-T</th><th>DIFF</th><th>+M</th><th>P</th></tr></thead>
    <tbody>{rows.map((r, i) => <tr key={r.t.id}><td>{i + 1}. {tn(r.t)}</td><td>{r.g}</td><td>{r.w}-{r.l}-{r.tie}</td><td>{r.diff}</td><td>{r.gw}</td><td>{r.pts}</td></tr>)}</tbody></table></div></div>
}

function BracketPage({ tours, teams, matches }) {
  if (!tours.length) return <div className="empty">No tournaments yet.</div>
  return <>{tours.map(t => {
    const tm = teams.filter(x => x.tournament_id === t.id), ms = matches.filter(x => x.tournament_id === t.id)
    const groups = [...new Set(tm.map(x => x.grp))].sort(), real = ms.some(m => m.round !== 'Group Stage')
    return <div key={t.id} className="tsec">
      {tours.length > 1 && <div className="th"><h2>{t.name}</h2><div className="tmeta"><span className="chip">{t.gender}</span><span className="chip">{t.level}</span></div></div>}
      <h3 className="sec">Bracket {!real && <span className="chip">Projected</span>}</h3>
      <BracketView matches={real ? ms : virtualKO(tm)} title={t.name} virtual={!real} />
      <div className="gg">{groups.map(g => <GroupTable key={g} g={g} teams={tm} matches={ms} />)}</div>
    </div>
  })}</>
}

function Results({ matches }) {
  const done = matches.filter(m => m.status === 'finished')
  return <>
    <h3 className="sec">Match history <span className="chip">{done.length}</span></h3>
    {done.length ? <div className="grid">{[...done].reverse().map(m => <Card key={m.id} m={m} />)}</div> : <div className="empty">No finished matches yet.</div>}
  </>
}

function TV({ matches, exit }) {
  const live = matches.filter(m => m.status === 'live'), next = matches.filter(m => m.status === 'scheduled').slice(0, 3)
  return <div className="tv">
    <div className="tvh"><div className="logo">Court<span>line</span></div><Clock /><button className="btn g" onClick={exit}>Exit</button></div>
    <h3 className="sec">Live</h3>{live.length ? <div className="grid">{live.map(m => <Card key={m.id} m={m} />)}</div> : <p>No live matches.</p>}
    {next.length > 0 && <><h3 className="sec">Up next</h3><div className="grid">{next.map(m => <Card key={m.id} m={m} />)}</div></>}
  </div>
}

export default function App() {
  const [tab, setTab] = useState('live'), [tid, setTid] = useState('all'), d = useData(), first = useRef(true)
  // tapping a navigation item scrolls smoothly to the content
  useEffect(() => {
    if (first.current) { first.current = false; return }
    document.getElementById('content')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    document.querySelector('.bar nav .on, .tabbar .on')?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [tab])
  const tmap = Object.fromEntries(d.tours.map(t => [t.id, t.name]))
  const pick = x => tid === 'all' || x.tournament_id === tid
  const tours = d.tours.filter(t => tid === 'all' || t.id === tid)
  const f = { tours, teams: d.teams.filter(pick), matches: d.matches.filter(pick).map(m => ({ ...m, tname: tid === 'all' ? tmap[m.tournament_id] : null })), one: tid === 'all' ? null : tours[0] }
  if (tab === 'tv') return <TV matches={f.matches} exit={() => setTab('live')} />
  const admin = tab === 'admin'
  return <>
    <header className="bar"><div className="bi">
      <div className="logo"><svg width="28" height="28" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="#fff" /><circle cx="16" cy="16" r="8" fill="none" stroke="#032a5f" strokeWidth="2.6" /><path d="M9 12c4 1 10 1 14 0M9 20c4-1 10-1 14 0" stroke="#032a5f" strokeWidth="1.6" fill="none" /></svg>Court<span>line</span></div>
      <nav>{TABS.map(([k, v]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{v}</button>)}</nav>
      <Clock />
    </div></header>
    <main className="wrap" id="content">
      {!admin && <Banner {...f} />}
      {!admin && <div className="tools">
        <select value={tid} onChange={e => setTid(e.target.value)}><option value="all">All tournaments</option>{d.tours.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        {window.Notification?.permission === 'default' && <button className="btn o sm" onClick={() => Notification.requestPermission().then(() => setTab(t => t))}>Notify me</button>}
      </div>}
      {tab === 'live' && <Live {...f} />}
      {tab === 'schedule' && <Schedule {...f} />}
      {tab === 'bracket' && <BracketPage {...f} />}
      {tab === 'results' && <Results {...f} />}
      {admin && <Admin {...d} tid={tid} onBack={() => setTab('live')} />}
    </main>
    <footer>Courtline · all times in WITA (UTC+8)</footer>
    <nav className="tabbar">{TABS.map(([k, v]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><Ico k={k} />{v}</button>)}</nav>
  </>
}
