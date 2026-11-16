import { useEffect, useMemo, useState } from 'react'
import { fmtDate, fmtTime, fmtDay, tn, activeCourts, scoreText, tourLabel } from './util'
import { mname } from './AdminExtra'
import { table } from './standings'

const I = {
  teams: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0112 0M16 5a3.2 3.2 0 010 6M18 20a6 6 0 00-3-5.2" /></>,
  matches: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
  live: <><circle cx="12" cy="12" r="3" /><path d="M6.3 6.3a8 8 0 000 11.4M17.7 6.3a8 8 0 010 11.4" /></>,
  done: <><circle cx="12" cy="12" r="9" /><path d="M8 12.5l3 3 5-6" /></>,
  todo: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  late: <><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.5" /></>,
  go: <path d="M5 12h14M13 6l6 6-6 6" />,
  ctl: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  score: <><rect x="7" y="2.5" width="10" height="19" rx="2" /><path d="M11 18h2" /></>,
  ann: <path d="M4 10v4h3l7 4V6L7 10zM17 9a4 4 0 010 6" />,
  add: <path d="M12 5v14M5 12h14" />,
  rank: <path d="M8 4h8v5a4 4 0 01-8 0zM8 6H4v1a3 3 0 003 3M16 6h4v1a3 3 0 01-3 3M12 13v4M8 20h8" />
}
export const Svg = ({ k, cls = 'di' }) => <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{I[k]}</svg>

const greet = () => { const h = new Date().getHours(); return h < 11 ? 'Good morning' : h < 15 ? 'Good afternoon' : h < 19 ? 'Good evening' : 'Good night' }

// Progress ring (SVG) for the overall completion
function Ring({ pct }) {
  const r = 52, c = 2 * Math.PI * r
  return <svg className="ring" viewBox="0 0 120 120" role="img" aria-label={`${pct}% played`}>
    <circle cx="60" cy="60" r={r} className="rt" /><circle cx="60" cy="60" r={r} className="rf" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform="rotate(-90 60 60)" />
    <text x="60" y="58" textAnchor="middle" className="rn">{pct}%</text><text x="60" y="76" textAnchor="middle" className="rl">played</text>
  </svg>
}

const Teams2 = ({ m }) => <><b>{tn(m.t1) || m.slot1 || 'TBD'}</b><i>vs</i><b>{tn(m.t2) || m.slot2 || 'TBD'}</b></>

export function Dashboard({ me, admin, matches, teams, tours, ann, settings, go, openMatch }) {
  const [now, setNow] = useState(Date.now()), tmap = Object.fromEntries(tours.map(x => [x.id, tourLabel(x)]))
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(i) }, [])
  const D = useMemo(() => {
    const live = matches.filter(m => m.status === 'live'), done = matches.filter(m => m.status === 'finished'), todo = matches.filter(m => m.status === 'scheduled')
    const byTime = (a, b) => new Date(a.start_at) - new Date(b.start_at)
    const next = [...todo].sort(byTime), late = todo.filter(m => +new Date(m.start_at) < now - 5 * 6e4)
    const empty = matches.filter(m => m.status !== 'finished' && m.round === 'Group Stage' && (!m.team1 || !m.team2)).length
    const end = matches.filter(m => m.status !== 'finished').reduce((mx, m) => Math.max(mx, +new Date(m.start_at) + (m.duration || 60) * 6e4), 0)
    const walk = done.filter(m => m.wo).length
    const perTour = tours.map(tr => {
      const ms = matches.filter(m => m.tournament_id === tr.id), d = ms.filter(m => m.status === 'finished').length
      return { tr, total: ms.length, done: d, live: ms.filter(m => m.status === 'live').length, teams: teams.filter(x => x.tournament_id === tr.id).length, pct: ms.length ? Math.round(d / ms.length * 100) : 0 }
    })
    // finished groups that are still level -> an admin has to set the order by hand
    let ties = 0
    try {
      tours.forEach(tr => {
        const tm = teams.filter(x => x.tournament_id === tr.id), ms = matches.filter(x => x.tournament_id === tr.id)
        ;[...new Set(tm.map(x => x.grp))].forEach(g => { if (table(tm.filter(x => x.grp === g), ms.filter(m => m.round === 'Group Stage' && tm.some(x => x.grp === g && x.id === m.team1))).unresolved) ties++ })
      })
    } catch { /* standings are optional here */ }
    return { live, done, todo, next, late, empty, end, walk, perTour, ties, total: matches.length, pct: matches.length ? Math.round(done.length / matches.length * 100) : 0,
      recent: [...done].sort((a, b) => byTime(b, a)).slice(0, 5) }
  }, [matches, teams, tours, now])

  const courts = [...new Set([...activeCourts(settings), ...matches.filter(m => m.status === 'live').map(m => m.court)])]
  const alerts = [
    D.late.length > 0 && { k: 'bad', t: `${D.late.length} match${D.late.length > 1 ? 'es are' : ' is'} past the start time and not started`, a: 'Open match control', to: 'control' },
    D.empty > 0 && admin && { k: 'warn', t: `${D.empty} group match${D.empty > 1 ? 'es have' : ' has'} an empty team slot`, a: 'Fix in timetable', to: 'timetable' },
    D.ties > 0 && admin && { k: 'warn', t: `${D.ties} finished group${D.ties > 1 ? 's are' : ' is'} still level — set the order by hand`, a: 'Open standings', to: 'standings' },
    !tours.length && admin && { k: 'info', t: 'No tournament yet. Create one to get started.', a: 'Create tournament', to: 'tournaments' },
    tours.length > 0 && !D.total && admin && { k: 'info', t: 'No matches yet. Generate the group fixtures.', a: 'Create matches', to: 'fixtures' }
  ].filter(Boolean)
  const kpi = [
    ['teams', teams.length, 'Teams', ''], ['matches', D.total, 'Matches', ''], ['live', D.live.length, 'Live now', D.live.length ? 'hot' : ''],
    ['done', D.done.length, 'Finished', 'ok'], ['todo', D.todo.length, 'To play', ''], ['late', D.late.length, 'Late', D.late.length ? 'bad' : '']
  ]
  const actions = [
    ['ctl', 'Match control', 'Start, score & correct', 'control', true], ['score', 'Scorer', 'Full-screen court scoring', 'scorer', true],
    ['ann', 'Announcement', 'Message to all viewers', 'announcements', false], ['add', 'Create matches', 'Fixtures & knockout', 'fixtures', false],
    ['teams', 'Teams', 'Add, import, draw groups', 'teams', false], ['rank', 'Standings', 'Group tables', 'standings', false]
  ].filter(a => a[4] || admin)
  const active = ann.filter(a => a.active)

  return <div className="dash">
    <section className="dhero">
      <div className="dh-t">
        <small>{fmtDay(now)}</small>
        <h2>{greet()}, {me.username}</h2>
        <p>{settings.name}{settings.venue ? ` · ${settings.venue}` : ''}{settings.dates ? ` · ${settings.dates}` : ''}</p>
        <div className="dh-m">
          {D.live.length > 0 ? <span className="pill hot"><i />{D.live.length} match{D.live.length > 1 ? 'es' : ''} live now</span> : <span className="pill">No match live right now</span>}
          {D.next[0] && <span className="pill">Next {fmtTime(D.next[0].start_at)} · {D.next[0].court}</span>}
          {D.end > 0 && <span className="pill">Ends about {fmtTime(D.end)}</span>}
        </div>
      </div>
      <Ring pct={D.pct} />
    </section>

    <section className="kpis">{kpi.map(([ic, n, l, c]) => <div key={l} className={'kpi ' + c}><span className="ki"><Svg k={ic} /></span><div><b>{n}</b><small>{l}</small></div></div>)}</section>

    {alerts.length > 0 && <section className="dcard alerts"><h3>Needs attention</h3>{alerts.map((a, i) => <div key={i} className={'al ' + a.k}><span className="ad" /><p>{a.t}</p><button className="btn sm o" onClick={() => go(a.to)}>{a.a}</button></div>)}</section>}

    <div className="dgrid">
      <section className="dcard span2"><div className="dch"><h3>Courts</h3><span className="muted">{courts.length} active</span></div>
        {courts.length ? <div className="cgrid">{courts.map(c => {
          const l = matches.find(m => m.court === c && m.status === 'live'), n = matches.filter(m => m.court === c && m.status === 'scheduled').sort((a, b) => new Date(a.start_at) - new Date(b.start_at))[0]
          const sc = l && scoreText(l)
          return <div key={c} className={'cc' + (l ? ' on' : '')}>
            <div className="cch"><b>{c}</b><span className={'tag' + (l ? ' live' : '')}>{l ? 'LIVE' : 'Free'}</span></div>
            {l ? <button className="ccm" onClick={() => openMatch(l.id)}><span className="tms"><Teams2 m={l} /></span><span className="sc">{sc}</span></button>
              : <p className="muted">{n ? `Next ${fmtTime(n.start_at)}` : 'Nothing scheduled'}</p>}
            {l && n && <small className="muted">Next {fmtTime(n.start_at)}</small>}
          </div>
        })}</div> : <p className="muted">No courts set up. Add them in Rules & courts.</p>}
      </section>

      <section className="dcard"><div className="dch"><h3>Quick actions</h3></div>
        <div className="qa">{actions.map(([ic, t, s, to]) => <button key={to} onClick={() => go(to)}><span className="ki"><Svg k={ic} /></span><span><b>{t}</b><small>{s}</small></span><Svg k="go" cls="di arr" /></button>)}</div>
      </section>

      <section className="dcard"><div className="dch"><h3>Up next</h3><button className="link" onClick={() => go('control')}>All</button></div>
        {D.next.length ? <ul className="ml">{D.next.slice(0, 6).map(m => <li key={m.id}>
          <div className="mt"><b>{fmtTime(m.start_at)}</b><small>{m.court}</small></div>
          <div className="mb"><span className="tms"><Teams2 m={m} /></span><small>{m.round}{tmap[m.tournament_id] && tours.length > 1 ? ` · ${tmap[m.tournament_id]}` : ''}</small></div>
          {+new Date(m.start_at) < now - 5 * 6e4 && <span className="tag bad">Late</span>}
        </li>)}</ul> : <p className="muted">No matches left to play.</p>}
      </section>

      <section className="dcard"><div className="dch"><h3>Recent results</h3><button className="link" onClick={() => go('control')}>All</button></div>
        {D.recent.length ? <ul className="ml">{D.recent.map(m => <li key={m.id}>
          <div className="mt"><b>{fmtTime(m.start_at)}</b><small>{m.court}</small></div>
          <div className="mb"><span className="tms"><Teams2 m={m} /></span><small>{m.round}{m.wo ? ' · WO' : ''}</small></div>
          <span className="sc2">{scoreText(m).replace('  WO', '')}</span>
        </li>)}</ul> : <p className="muted">No finished matches yet.</p>}
      </section>

      <section className="dcard span2"><div className="dch"><h3>Progress by tournament</h3><span className="muted">{D.done.length}/{D.total} matches</span></div>
        {D.perTour.length ? <div className="tp2">{D.perTour.map(x => <div key={x.tr.id} className="tpr">
          <div className="tpn"><b>{tourLabel(x.tr)}</b><small>{x.teams} teams · {x.done}/{x.total} matches{x.live ? ` · ${x.live} live` : ''}</small></div>
          <div className="bar2"><i style={{ width: x.pct + '%' }} /></div><span className="pc">{x.pct}%</span>
        </div>)}</div> : <p className="muted">No tournaments yet.</p>}
      </section>

      <section className="dcard"><div className="dch"><h3>Announcements</h3>{admin && <button className="link" onClick={() => go('announcements')}>Manage</button>}</div>
        {active.length ? active.slice(0, 3).map(a => <div key={a.id} className={'ann2 ' + (a.level === 'warning' ? 'w' : '')}><b>{a.level === 'warning' ? 'Important' : 'Notice'}</b><p>{a.message}</p></div>)
          : <p className="muted">No announcement is showing to viewers.</p>}
      </section>
    </div>
  </div>
}
