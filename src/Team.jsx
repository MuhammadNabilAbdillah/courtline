import { useContext } from 'react'
import { Ctx, Card, Feature } from './ui'
import { table } from './standings'
import { tn, fmtDate, fmtTime, rule, rd, share, waLink, matchUrl, tzLabel } from './util'
import { t } from './i18n'

export function GroupTable({ g, teams, matches, hl }) {
  const { go } = useContext(Ctx)
  const rows = table(teams.filter(x => x.grp === g), matches)
  return <div className="gt"><h3>{t('Group')} {g}</h3><div className="scroll"><table className="tb">
    <thead><tr><th>{t('TEAM')}</th><th>G</th><th>W-L-T</th><th>{t('DIFF')}</th><th>+M</th><th>P</th></tr></thead>
    <tbody>{rows.map((r, i) => <tr key={r.t.id} className={hl === r.t.id ? 'me' : ''}><td>{i + 1}. <button className="tl" onClick={() => go('/team/' + r.t.id)}>{tn(r.t)}</button></td><td>{r.g}</td><td>{r.w}-{r.l}-{r.tie}</td><td>{r.diff}</td><td>{r.gw}</td><td>{r.pts}</td></tr>)}</tbody></table></div></div>
}

const Back = ({ back }) => <button className="link back" onClick={back}>← {t('Back')}</button>

// Team profile: record, group position and every match of the team
export function TeamPage({ id, teams, matches, tours, back, ready }) {
  const { favs, toggle } = useContext(Ctx)
  const team = teams.find(x => x.id === id)
  if (!team) return <><Back back={back} /><div className="empty">{ready ? t('Team not found') : t('Loading…')}</div></>
  const tour = tours.find(x => x.id === team.tournament_id), fav = favs.includes(id)
  const all = matches.filter(m => m.tournament_id === team.tournament_id)
  const mine = all.filter(m => m.team1 === id || m.team2 === id)
  const done = mine.filter(m => m.status === 'finished'), up = mine.filter(m => m.status !== 'finished')
  const wins = done.filter(m => m.winner === id).length
  let gw = 0, gl = 0
  done.forEach(m => m.sets.forEach(s => { const a = m.team1 === id ? 0 : 1; gw += s[a]; gl += s[1 - a] }))
  const rank = table(teams.filter(x => x.tournament_id === team.tournament_id && x.grp === team.grp), all).findIndex(r => r.t.id === id) + 1
  return <>
    <Back back={back} />
    <section className="banner">
      <div>
        <small>{tour ? `${tour.gender} · ${tour.level}` : ''}</small>
        <h1>{tn(team)}</h1>
        <div className="tmeta"><span>{team.player1} / {team.player2}</span><span>{t('Group')} {team.grp}</span><span>{t('Games')} {gw}-{gl}</span></div>
      </div>
      <div className="bst"><div><b>{wins}</b><span>{t('Won')}</span></div><div><b>{done.length - wins}</b><span>{t('Lost')}</span></div><div><b>{rank ? '#' + rank : '–'}</b><span>{t('Group rank')}</span></div></div>
    </section>
    <div className="tools"><button className={'btn sm' + (fav ? '' : ' o')} onClick={() => toggle(id)}>{fav ? '★ ' + t('In your favourites') : '☆ ' + t('Add to favourites')}</button></div>
    {up.length > 0 && <><h3 className="sec">{t('Live & upcoming')} <span className="chip">{up.length}</span></h3><div className="grid">{up.map(m => <Card key={m.id} m={m} />)}</div></>}
    {done.length > 0 && <><h3 className="sec">{t('Match history')} <span className="chip">{done.length}</span></h3><div className="grid">{[...done].reverse().map(m => <Card key={m.id} m={m} />)}</div></>}
    {!mine.length && <div className="empty">{t('No matches yet.')}</div>}
    <h3 className="sec">{t('Group standings')}</h3>
    <div className="gg"><GroupTable g={team.grp} teams={teams.filter(x => x.tournament_id === team.tournament_id)} matches={all} hl={id} /></div>
  </>
}

// One match, one link: this is the page people open from a shared WhatsApp link
export function MatchPage({ id, matches, back, ready }) {
  const { go } = useContext(Ctx)
  const m = matches.find(x => x.id === id)
  if (!m) return <><Back back={back} /><div className="empty">{ready ? t('Match not found') : t('Loading…')}</div></>
  const copy = () => navigator.clipboard?.writeText(matchUrl(m)).then(() => alert(t('Link copied')))
  return <>
    <Back back={back} />
    {m.status === 'live' ? <Feature m={m} /> : <div className="one"><Card m={m} /></div>}
    <div className="panel mdet">
      <h3>{t('Match details')}</h3>
      <div className="dl">
        {m.tname && <><span>{t('Tournament')}</span><b>{m.tname}</b></>}
        <span>{t('Round')}</span><b>{rd(m.round)}</b>
        <span>{t('Court')}</span><b>{m.court}</b>
        <span>{t('Start')}</span><b>{fmtDate(m.start_at)} · {fmtTime(m.start_at)} {tzLabel()}</b>
        <span>{t('Format')}</span><b>{rule(m)} · {m.golden ? t('Golden point') : t('Advantage')}</b>
      </div>
      <div className="ctrl">
        {m.t1 && <button className="btn o sm" onClick={() => go('/team/' + m.t1.id)}>{tn(m.t1)}</button>}
        {m.t2 && <button className="btn o sm" onClick={() => go('/team/' + m.t2.id)}>{tn(m.t2)}</button>}
      </div>
      <div className="ctrl">
        <button className="btn sm" onClick={() => share(m)}>{t('Share')}</button>
        <a className="btn o sm" href={waLink(m)} target="_blank" rel="noreferrer">WhatsApp</a>
        <button className="btn o sm" onClick={copy}>{t('Copy link')}</button>
      </div>
    </div>
  </>
}
