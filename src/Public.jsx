import { useEffect, useState } from 'react'
import { tn, fmtDay, fmtDate, fmtTime, clock, rd, scoreText, genderLabel, hasFav } from './util'
import { nextFor } from './turn'
import { t } from './i18n'

const round5 = ms => Math.round(ms / 3e5) * 3e5

// "Your team plays around 10:30 on Court 2 · 1 match before yours"
export function TurnCard({ team, matches, est, go }) {
  const nx = nextFor(team.id, matches, est)
  const opp = nx && (nx.m.team1 === team.id ? nx.m.t2 || null : nx.m.t1 || null)
  const oppName = nx && (opp ? tn(opp) : (nx.m.team1 === team.id ? nx.m.slot2 : nx.m.slot1) || t('TBD'))
  const at = nx && new Date(round5(nx.e.start)), today = nx && fmtDay(at) === fmtDay(new Date())
  const late = nx && nx.e.late ? Math.round((nx.e.start - new Date(nx.m.start_at).getTime()) / 6e4 / 5) * 5 : 0
  return <div className={'turn' + (nx && nx.m.status === 'live' ? ' on' : '')}>
    <div className="tt"><button className="tl" onClick={() => go('/team/' + team.id)}>★ {tn(team)}</button>{nx && <button className="link" onClick={() => go('/match/' + nx.m.id)}>{t('Open')}</button>}</div>
    {!nx && <p>{t('No more matches scheduled.')}</p>}
    {nx && nx.m.status === 'live' && <p className="big">{t('Your match is live now')} · {nx.m.court}</p>}
    {nx && nx.m.status !== 'live' && <p className="big">{t('Plays around')} {fmtTime(at)}{!today && ` · ${fmtDate(at)}`} · {nx.m.court}</p>}
    {nx && <p className="sub">{t('vs')} {oppName} · {rd(nx.m.round)}</p>}
    {nx && nx.m.status !== 'live' && <p className="sub">{nx.e.ahead === 0 ? t('You are up next on {0}', nx.m.court) : nx.e.ahead === 1 ? t('1 match before yours on {0}', nx.m.court) : t('{0} matches before yours on {1}', nx.e.ahead, nx.m.court)}
      {late > 0 && ` · ${t('scheduled {0}, running about {1} min behind', fmtTime(nx.m.start_at), late)}`}</p>}
  </div>
}

export function MyTurn({ favs, teams, matches, est, go, toTeams }) {
  if (!teams.length) return null
  const mine = favs.map(id => teams.find(x => x.id === id)).filter(Boolean)
  if (!mine.length) return <div className="turn hint"><b>★ {t('Follow your team')}</b><p className="sub">{t('Star your team to see when you play and how many matches come before yours.')}</p><button className="btn sm" onClick={toTeams}>{t('Find my team')}</button></div>
  return <><h3 className="sec">{t('Your turn')}</h3><div className="grid">{mine.map(tm => <TurnCard key={tm.id} team={tm} matches={matches} est={est} go={go} />)}</div></>
}

// Everyone in one place, with search
export function TeamsPage({ teams, tours, matches, favs, toggle, go }) {
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase(), tmap = Object.fromEntries(tours.map(x => [x.id, x]))
  const rec = id => { const d = matches.filter(m => m.status === 'finished' && (m.team1 === id || m.team2 === id)), w = d.filter(m => m.winner === id).length; return d.length ? `${w}W ${d.length - w}L` : '' }
  const list = teams.filter(x => !needle || [tn(x), x.player1, x.player2, (tmap[x.tournament_id] || {}).name, 'group ' + x.grp].join(' ').toLowerCase().includes(needle))
  const secs = tours.map(tr => ({ tr, rows: list.filter(x => x.tournament_id === tr.id).sort((a, b) => (a.grp || '').localeCompare(b.grp || '') || tn(a).localeCompare(tn(b))) })).filter(s => s.rows.length)
  return <>
    <h3 className="sec">{t('Participants')} <span className="chip">{list.length} {t('teams')} · {list.length * 2} {t('players')}</span></h3>
    <div className="tools"><input className="search" placeholder={t('Search team, player or category…')} value={q} onChange={e => setQ(e.target.value)} /></div>
    {secs.length ? secs.map(({ tr, rows }) => <div key={tr.id} className="tsec">
      <div className="th"><h2>{tr.name}</h2><div className="tmeta"><span className="chip">{genderLabel(tr.gender)}</span><span className="chip">{tr.level}</span><span>{rows.length} {t('teams')}</span></div></div>
      <div className="card list">{rows.map(x => <div className="prow" key={x.id}>
        <button className={'star' + (favs.includes(x.id) ? ' on' : '')} aria-pressed={favs.includes(x.id)} aria-label={t('Add to favourites')} onClick={() => toggle(x.id)}>{favs.includes(x.id) ? '★' : '☆'}</button>
        <div className="pm"><button className="tl" onClick={() => go('/team/' + x.id)}>{tn(x)}</button><small>{x.player1} / {x.player2}</small></div>
        <span className="chip">{t('Group')} {x.grp}</span><span className="rec">{rec(x.id)}</span>
      </div>)}</div>
    </div>) : <div className="empty">{teams.length ? t('No team or player matches your search.') : t('No teams yet.')}</div>}
  </>
}

// One table: courts as columns, start times as rows
export function CourtGrid({ matches, courts, est, favs, go }) {
  const ms = [...matches].sort((a, b) => new Date(a.start_at) - new Date(b.start_at))
  const names = [...new Set([...courts, ...ms.map(m => m.court)])].filter(Boolean)
  const days = [...new Set(ms.map(m => fmtDay(m.start_at)))]
  if (!ms.length) return <div className="empty">{t('No scheduled matches.')}</div>
  const cols = { gridTemplateColumns: `4.4rem repeat(${names.length}, minmax(9.5rem, 1fr))` }
  return days.map(d => {
    const dm = ms.filter(m => fmtDay(m.start_at) === d), slots = [...new Set(dm.map(m => fmtTime(m.start_at)))]
    return <div key={d}><div className="day">{d}</div><div className="scroll"><div className="cg" style={cols}>
      <div className="cgh cgt" />{names.map(c => <div key={c} className="cgh">{c}</div>)}
      {slots.map(s => [<div key={'t' + s} className="cgt"><b>{s}</b></div>, ...names.map(c => {
        const m = dm.find(x => x.court === c && fmtTime(x.start_at) === s)
        if (!m) return <div key={s + c} className="cgc empty">–</div>
        const e = est[m.id], late = e && e.late && m.status === 'scheduled'
        return <button key={s + c} className={'cgc' + (m.status === 'live' ? ' live' : m.status === 'finished' ? ' done' : '') + (hasFav(m, favs) ? ' fav' : '')} onClick={() => go('/match/' + m.id)}>
          <b>{tn(m.t1) || m.slot1 || t('TBD')}</b><b>{tn(m.t2) || m.slot2 || t('TBD')}</b>
          <small>{m.status === 'scheduled' ? `${rd(m.round)}${late ? ' · ~' + fmtTime(new Date(round5(e.start))) : ''}` : `${m.status === 'live' ? t('LIVE') + ' · ' : ''}${scoreText(m).replace('*', '').replace('  WO', ' WO')}`}</small>
        </button>
      })])}
    </div></div></div>
  })
}

// Who scored when, newest first (match page)
export function PointLog({ m }) {
  const pts = m.points || []
  if (m.status === 'scheduled') return null
  return <div className="panel"><h3>{t('Point history')}</h3>
    {!pts.length ? <p className="muted">{t('No point-by-point log for this match.')}</p> :
      <ol className="plog">{pts.map((e, i) => ({ e, i })).reverse().map(({ e, i }) => <li key={i} className={e.t === 0 || e.t === 1 ? '' : 'note'}>
        <span className="pt0">{clock(e.at)}</span>
        <span className="pw">{e.t === 0 || e.t === 1 ? <><b>{tn(e.t ? m.t2 : m.t1) || t('Team')}</b> {t('scored')}</> : <i>{e.note || t('Score corrected')}</i>}</span>
        <span className="ps">{e.sc}</span></li>)}</ol>}
  </div>
}

export function Countdown({ target }) {
  const [n, setN] = useState(Date.now())
  useEffect(() => { const i = setInterval(() => setN(Date.now()), 30000); return () => clearInterval(i) }, [])
  const ms = target - n
  if (!(ms > 0)) return null
  const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5), mi = Math.floor((ms % 36e5) / 6e4)
  return <span className="chip cd">{d > 0 ? t('Kick-off in {0}d {1}h', d, h) : t('Kick-off in {0}h {1}m', h, mi)}</span>
}
