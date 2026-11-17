import { useState } from 'react'
import { Card, Feature } from './ui'
import { MyTurn } from './Public'
import { tn, fmtTime, fmtDay, rd, tourSub, hasFav } from './util'
import { t } from './i18n'

// Kotak juara: muncul setelah final suatu kategori selesai
export function Champions({ tours, matches }) {
  const rows = tours.map(tr => {
    const ms = matches.filter(m => m.tournament_id === tr.id), fin = ms.find(m => m.round === 'Final' && m.status === 'finished'), th = ms.find(m => m.round === 'Third Place' && m.status === 'finished')
    if (!fin) return null
    const pick = (m, win) => (win ? (m.winner === m.team1 ? m.t1 : m.t2) : (m.winner === m.team1 ? m.t2 : m.t1))
    return { tr, champ: pick(fin, true), runner: pick(fin, false), third: th ? pick(th, true) : null }
  }).filter(Boolean)
  if (!rows.length) return null
  return rows.map(r => <section key={r.tr.id} className="champ">
    <small>{t('CHAMPIONS')}{tours.length > 1 ? ` · ${r.tr.name}` : ''}</small>
    <h2>🏆 {tn(r.champ)}</h2>
    <p>{r.champ && `${r.champ.player1} / ${r.champ.player2}`}</p>
    <div className="tmeta"><span>{t('Runner-up')}: {tn(r.runner)}</span>{r.third && <span>{t('Third place')}: {tn(r.third)}</span>}</div>
  </section>)
}

// Status lapangan (kosong / sedang dipakai / jam berikutnya)
export function Courts({ matches, courts }) {
  const names = [...new Set([...courts, ...[...new Set(matches.filter(m => m.status !== 'finished').map(m => m.court))].sort()])]
  if (!names.length) return null
  return <><h3 className="sec">{t('Court status')}</h3><div className="courts">{names.map(c => {
    const l = matches.find(m => m.court === c && m.status === 'live'), n = matches.find(m => m.court === c && m.status === 'scheduled')
    return <div key={c} className={'ct' + (l ? ' on' : '')}><b>{c}</b><p>{l ? `${rd(l.round)} · ${t('live')}` : n ? t('Next {0}', fmtTime(n.start_at)) : t('Free')}</p></div>
  })}</div></>
}

const HELP = ['Tap ★ next to your team to follow it. Your matches then appear first.', 'Open Schedule to see the time and court of every match.', 'Live shows the score point by point, and Bracket shows who plays in the semifinal and final.', 'Tap Share on any match to send it to friends on WhatsApp.']

// Kartu per kategori: berapa tim, progres pertandingan, dan juara bila sudah ada
function CategoryCards({ tours, teams, matches, openTour }) {
  if (!tours.length) return <div className="empty">{t('No categories yet.')}</div>
  return <div className="cats">{tours.map(tr => {
    const ms = matches.filter(m => m.tournament_id === tr.id), done = ms.filter(m => m.status === 'finished').length, live = ms.filter(m => m.status === 'live').length
    const pct = ms.length ? Math.round(done / ms.length * 100) : 0, ko = ms.some(m => m.round !== 'Group Stage')
    const fin = ms.find(m => m.round === 'Final' && m.status === 'finished'), champ = fin && (fin.winner === fin.team1 ? fin.t1 : fin.t2)
    const state = champ ? t('Completed') : live ? t('Live now') : !ms.length ? t('Not started') : ko ? t('Knockout Stage') : t('Group Stage')
    return <div className="cat" key={tr.id}>
      <div className="cath"><div><b>{tr.name}</b><small>{tourSub(tr)}</small></div><span className={'chip' + (live ? ' hotc' : '')}>{state}</span></div>
      {champ && <p className="catc">🏆 {tn(champ)}</p>}
      <div className="bar2"><i style={{ width: pct + '%' }} /></div>
      <small className="muted">{teams.filter(x => x.tournament_id === tr.id).length} {t('teams')} · {done}/{ms.length} {t('matches')} · {pct}%</small>
      <div className="ctrl"><button className="btn o sm" onClick={() => openTour(tr.id, 'bracket')}>{t('Bracket')}</button><button className="btn o sm" onClick={() => openTour(tr.id, 'schedule')}>{t('Schedule')}</button><button className="btn o sm" onClick={() => openTour(tr.id, 'results')}>{t('Results')}</button></div>
    </div>
  })}</div>
}

// Beranda untuk penonton: ringkasan seluruh acara dalam satu layar
export default function Home({ tours, teams, matches, favs, courts, est, go, nav, openTour, allTours, allTeams, allMatches }) {
  const [help, setHelp] = useState(() => { try { return !localStorage.getItem('cl-help') } catch { return true } })
  const closeHelp = () => { setHelp(false); try { localStorage.setItem('cl-help', '1') } catch { /* mode privat */ } }
  const byFav = (a, b) => hasFav(b, favs) - hasFav(a, favs)
  const live = matches.filter(m => m.status === 'live').sort(byFav)
  const next = matches.filter(m => m.status === 'scheduled').sort(byFav).slice(0, 4)
  const recent = matches.filter(m => m.status === 'finished').slice(-3).reverse()
  const links = [['schedule', 'Schedule', 'Schedule, courts and times'], ['bracket', 'Bracket', 'Bracket'], ['results', 'Results', 'All results and scores'], ['teams', 'Teams', 'Players and groups'], ['info', 'Info', 'Venue, rules, contacts'], ['tv', 'TV', 'TV screen']]
  return <>
    <Champions tours={tours} matches={matches} />
    {help && <section className="help"><div className="helph"><b>{t('How to use this app')}</b><button className="btn o sm" onClick={closeHelp}>{t('Got it')}</button></div>
      <ol>{HELP.map(h => <li key={h}>{t(h)}</li>)}</ol></section>}
    <MyTurn favs={favs} teams={allTeams} matches={allMatches} est={est} go={go} toTeams={() => nav('teams')} />
    <h3 className="sec">{t('Live now')} <span className="chip">{live.length}</span></h3>
    {live[0] && <Feature m={live[0]} />}
    {live.length > 1 && <div className="grid hgap">{live.slice(1).map(m => <Card key={m.id} m={m} />)}</div>}
    {!live.length && <div className="empty">{t('No match is live right now')}{next[0] && <small>{t('Next up')}: {fmtDay(next[0].start_at)} · {fmtTime(next[0].start_at)} · {next[0].court}</small>}</div>}
    {next.length > 0 && <><h3 className="sec">{t('Up next')} <button className="link" onClick={() => nav('schedule')}>{t('See all')}</button></h3><div className="grid">{next.map(m => <Card key={m.id} m={m} />)}</div></>}
    {recent.length > 0 && <><h3 className="sec">{t('Latest results')} <button className="link" onClick={() => nav('results')}>{t('See all')}</button></h3><div className="grid">{recent.map(m => <Card key={m.id} m={m} />)}</div></>}
    <h3 className="sec">{t('Categories')}</h3>
    <CategoryCards tours={allTours} teams={allTeams} matches={allMatches} openTour={openTour} />
    <Courts matches={matches} courts={courts} />
    <h3 className="sec">{t('Quick links')}</h3>
    <div className="ql">{links.map(([k, l, d]) => <button key={k} onClick={() => nav(k)}><b>{t(l)}</b><small>{t(d)}</small></button>)}</div>
  </>
}
