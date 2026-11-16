import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from './supabase'
import { Card, Clock, AnnounceBar, InstallButton, Ctx, Brand, Feature, QRCode } from './ui'
import { fmtDay, fmtTime, fmtDate, tn, rule, rd, tzLabel, setCfg, DEFAULTS, activeCourts, readFavs, writeFavs, hasFav } from './util'
import { BracketView, virtualKO } from './Bracket'
import { GroupTable, TeamPage, MatchPage } from './Team'
import PrintSheet from './Print'
import Admin from './Admin'
import { t, getLang, setLang } from './i18n'

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
  const [matches, setM] = useState([]), [teams, setT] = useState([]), [tours, setTo] = useState([]), [ann, setAnn] = useState([])
  const [settings, setSet] = useState(DEFAULTS), [ready, setReady] = useState(false), mref = useRef([])
  mref.current = matches
  const load = useCallback(async () => {
    const [a, b, c, d, e] = await Promise.all([
      supabase.from('matches').select(Q).order('start_at'),
      supabase.from('teams').select('*').order('name'),
      supabase.from('tournaments').select('*').order('created_at'),
      supabase.from('announcements').select('*').order('created_at', { ascending: false }),
      supabase.from('settings').select('*').eq('id', 'main').maybeSingle()])
    setM(a.data || []); setT(b.data || []); setTo(c.data || []); setAnn(d.data || [])
    setSet({ ...DEFAULTS, ...((e.data && e.data.data) || {}) }); setReady(true)
  }, [])
  useEffect(() => {
    load()
    const ch = supabase.channel('rt').on('postgres_changes', { event: '*', schema: 'public' }, p => {
      if (p.table === 'matches' && p.eventType === 'UPDATE') {
        const old = mref.current.find(x => x.id === p.new.id)
        if (old && window.Notification?.permission === 'granted') {
          // favourite teams get their own notifications; without favourites everyone gets "match started"
          const favs = readFavs(), mine = hasFav(old, favs), name = `${tn(old.t1) || 'TBD'} vs ${tn(old.t2) || 'TBD'}`
          if (old.status !== 'live' && p.new.status === 'live' && (!favs.length || mine))
            new Notification((mine ? '★ ' : '') + t('Match started'), { body: `${name} · ${old.court}` })
          if (old.status !== 'finished' && p.new.status === 'finished' && mine)
            new Notification('★ ' + t('Match finished'), { body: `${name} · ${p.new.sets.map(s => s.join('-')).join('  ')}${p.new.wo ? ' · WO' : ''}` })
        }
        if (old && old.team1 === p.new.team1 && old.team2 === p.new.team2) return setM(ms => ms.map(x => x.id === p.new.id ? { ...x, ...p.new } : x))
      }
      if (p.table === 'announcements' && p.eventType === 'INSERT' && p.new.active && window.Notification?.permission === 'granted')
        new Notification(p.new.level === 'warning' ? t('IMPORTANT') : t('NOTICE'), { body: p.new.message })
      load()
    }).subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])
  return { matches, teams, tours, ann, settings, ready, load }
}

function Banner({ one, matches, teams }) {
  const live = matches.filter(m => m.status === 'live').length, today = matches.filter(m => fmtDay(m.start_at) === fmtDay(new Date())).length
  const ko = matches.some(m => m.round !== 'Group Stage')
  return <section className="banner">
    <div>
      <small>{one ? `${one.gender} · ${one.level}` : t('ALL TOURNAMENTS')}</small>
      <h1>{one ? one.name : t('Padel live scores')}</h1>
      <div className="tmeta">{one && <><span>{ko ? t('Knockout Stage') : t('Group Stage')}</span>{one.start_date && <span>{fmtDate(one.start_date)}</span>}</>}<span>{t('All times in {0}', tzLabel())}</span></div>
    </div>
    <div className="bst"><div><b>{live}</b><span>{t('Live')}</span></div><div><b>{today}</b><span>{t('Today')}</span></div><div><b>{teams.length}</b><span>{t('Teams')}</span></div></div>
  </section>
}

function Courts({ matches, courts }) {
  const names = [...new Set([...courts, ...[...new Set(matches.filter(m => m.status !== 'finished').map(m => m.court))].sort()])]
  if (!names.length) return null
  return <><h3 className="sec">{t('Court status')}</h3><div className="courts">{names.map(c => {
    const l = matches.find(m => m.court === c && m.status === 'live'), n = matches.find(m => m.court === c && m.status === 'scheduled')
    return <div key={c} className={'ct' + (l ? ' on' : '')}><b>{c}</b><p>{l ? `${rd(l.round)} · ${t('live')}` : n ? t('Next {0}', fmtTime(n.start_at)) : t('Free')}</p></div>
  })}</div></>
}

function Live({ matches, favs, courts }) {
  const byFav = (a, b) => hasFav(b, favs) - hasFav(a, favs) // your teams first, otherwise time order is kept
  const live = matches.filter(m => m.status === 'live').sort(byFav), next = matches.filter(m => m.status === 'scheduled').sort(byFav).slice(0, favs.length ? 6 : 4)
  return <>
    {live[0] && <Feature m={live[0]} />}
    <h3 className="sec">{t('Live now')} <span className="chip">{live.length}</span></h3>
    {live.length ? <div className="grid">{live.map(m => <Card key={m.id} m={m} />)}</div> : <div className="empty">{t('No matches are live right now.')}</div>}
    <Courts matches={matches} courts={courts} />
    {next.length > 0 && <><h3 className="sec">{t('Up next')}</h3><div className="grid">{next.map(m => <Card key={m.id} m={m} />)}</div></>}
  </>
}

const MineToggle = ({ on, set, favs }) => favs.length > 0 && <button className={'btn sm' + (on ? '' : ' o')} onClick={() => set(!on)}>★ {t('My teams')}</button>

function Schedule({ matches, favs, onPrint }) {
  const [q, setQ] = useState(''), [mine, setMine] = useState(false)
  const list = matches.filter(m => m.status !== 'finished' && (!mine || hasFav(m, favs)) &&
    (tn(m.t1) + tn(m.t2) + m.t1?.player1 + m.t1?.player2 + m.t2?.player1 + m.t2?.player2 + m.court + m.round).toLowerCase().includes(q.toLowerCase()))
  const days = [...new Set(list.map(m => fmtDay(m.start_at)))]
  return <>
    <h3 className="sec">{t('Schedule')} <span className="chip">{tzLabel()}</span></h3>
    <div className="tools">
      <input className="search" placeholder={t('Search team, player, court or round…')} value={q} onChange={e => setQ(e.target.value)} />
      <MineToggle on={mine} set={setMine} favs={favs} />
      <button className="btn o sm" onClick={() => onPrint('schedule')}>{t('Print schedule')}</button>
    </div>
    {days.length ? days.map(d => <div key={d}><div className="day">{d}</div><div className="card list">
      {list.filter(m => fmtDay(m.start_at) === d).map(m => <div className={'srow' + (hasFav(m, favs) ? ' fav' : '')} key={m.id}>
        <div className="st"><b>{fmtTime(m.start_at)}</b><small>{m.court}</small></div>
        <div className="sm"><b>{tn(m.t1) || m.slot1 || t('TBD')}</b> <span>{t('vs')}</span> <b>{tn(m.t2) || m.slot2 || t('TBD')}</b>
          <small>{rd(m.round)}{m.tname ? ` · ${m.tname}` : ''} · {rule(m)}</small></div>
        <span className={'badge ' + (m.status === 'live' ? 'live' : '')}>{m.status === 'live' ? t('LIVE') : t('UPCOMING')}</span></div>)}
    </div></div>) : <div className="empty">{t('No scheduled matches.')}</div>}
  </>
}

function BracketPage({ tours, teams, matches }) {
  if (!tours.length) return <div className="empty">{t('No tournaments yet.')}</div>
  return <>{tours.map(tr => {
    const tm = teams.filter(x => x.tournament_id === tr.id), ms = matches.filter(x => x.tournament_id === tr.id)
    const groups = [...new Set(tm.map(x => x.grp))].sort(), real = ms.some(m => m.round !== 'Group Stage')
    return <div key={tr.id} className="tsec">
      {tours.length > 1 && <div className="th"><h2>{tr.name}</h2><div className="tmeta"><span className="chip">{tr.gender}</span><span className="chip">{tr.level}</span></div></div>}
      <h3 className="sec">{t('Bracket')} {!real && <span className="chip">{t('Projected')}</span>}</h3>
      <BracketView matches={real ? ms : virtualKO(tm)} title={tr.name} virtual={!real} />
      <div className="gg">{groups.map(g => <GroupTable key={g} g={g} teams={tm} matches={ms} />)}</div>
    </div>
  })}</>
}

function Results({ matches, favs }) {
  const [mine, setMine] = useState(false)
  const done = matches.filter(m => m.status === 'finished' && (!mine || hasFav(m, favs)))
  return <>
    <h3 className="sec">{t('Match history')} <span className="chip">{done.length}</span></h3>
    {favs.length > 0 && <div className="tools"><MineToggle on={mine} set={setMine} favs={favs} /></div>}
    {done.length ? <div className="grid">{[...done].reverse().map(m => <Card key={m.id} m={m} />)}</div> : <div className="empty">{t('No finished matches yet.')}</div>}
  </>
}

function TV({ matches, ann, site, exit }) {
  const live = matches.filter(m => m.status === 'live'), next = matches.filter(m => m.status === 'scheduled').slice(0, 3)
  const url = location.origin + location.pathname
  return <div className="tv">
    <div className="tvh"><Brand site={site} /><Clock />
      <div className="tvq"><QRCode text={url} px={92} /><span>{t('Scan to open the live scores on your phone')}</span></div>
      <button className="btn g" onClick={exit}>{t('Exit')}</button></div>
    <AnnounceBar items={ann} tv />
    <h3 className="sec">{t('Live')}</h3>{live.length ? <div className="grid">{live.map(m => <Card key={m.id} m={m} plain />)}</div> : <p>{t('No live matches.')}</p>}
    {next.length > 0 && <><h3 className="sec">{t('Up next')}</h3><div className="grid">{next.map(m => <Card key={m.id} m={m} plain />)}</div></>}
  </div>
}

// ---- navigation helpers: #/match/<id> and #/team/<id> are shareable links ----
let navs = 0
const go = p => { navs++; location.hash = '#' + p }
const back = () => { if (navs > 0) { navs--; history.back() } else location.hash = '' }
function useHash() {
  const [h, setH] = useState(location.hash)
  useEffect(() => { const f = () => setH(location.hash); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f) }, [])
  return h
}
const shade = (hex, k) => '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('')

export default function App() {
  const [tab, setTab] = useState('live'), [tid, setTid] = useState('all'), d = useData(), first = useRef(true)
  const [favs, setFavs] = useState(readFavs), [print, setPrint] = useState(null), [, bump] = useState(0)
  const [theme, setTheme] = useState(() => { try { const s = localStorage.getItem('cl-theme'); if (s) return s } catch { /* no storage */ } return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' })
  const hash = useHash(), route = /^#\/(match|team)\/([\w-]+)$/.exec(hash)
  const S = d.settings, lang = getLang()
  setCfg({ tz: S.tz, hour12: S.hour12 }) // before anything renders, so every time on screen uses the configured zone

  const brand = /^#[0-9a-f]{6}$/i.test(S.color) ? S.color : DEFAULTS.color
  document.documentElement.style.setProperty('--b', brand); document.documentElement.style.setProperty('--bd', shade(brand, .7))
  useEffect(() => { // event name, language, theme
    const r = document.documentElement, c = brand
    document.title = `${S.name || 'Courtline'} — ${t('Padel Live Score')}`
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', c)
    r.lang = lang; r.dataset.theme = theme
  }, [brand, S.name, lang, theme])
  useEffect(() => {
    if (first.current) { first.current = false; return }
    document.getElementById('content')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    document.querySelector('.bar nav .on, .tabbar .on')?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [tab])
  useEffect(() => { if (route) window.scrollTo(0, 0) }, [hash])

  const toggle = id => setFavs(f => { const n = f.includes(id) ? f.filter(x => x !== id) : [...f, id]; writeFavs(n); return n })
  const flip = () => { const n = theme === 'dark' ? 'light' : 'dark'; setTheme(n); try { localStorage.setItem('cl-theme', n) } catch { /* private mode */ } }
  const switchLang = () => { setLang(lang === 'id' ? 'en' : 'id'); bump(n => n + 1) }
  const nav = k => { if (location.hash) location.hash = ''; setTab(k) }

  const tmap = Object.fromEntries(d.tours.map(x => [x.id, x.name]))
  const all = d.matches.map(m => ({ ...m, tname: tmap[m.tournament_id] }))
  const pick = x => tid === 'all' || x.tournament_id === tid
  const tours = d.tours.filter(x => tid === 'all' || x.id === tid)
  const f = { tours, teams: d.teams.filter(pick), matches: d.matches.filter(pick).map(m => ({ ...m, tname: tid === 'all' ? tmap[m.tournament_id] : null })), one: tid === 'all' ? null : tours[0] }
  const ctx = { favs, toggle, go }
  const courts = activeCourts(S)

  if (print) return <PrintSheet kind={print.kind} tours={d.tours} teams={d.teams} matches={all} tid={print.tid ?? tid} site={S} onClose={() => setPrint(null)} />
  if (tab === 'tv') return <Ctx.Provider value={ctx}><TV matches={f.matches} ann={d.ann} site={S} exit={() => setTab('live')} /></Ctx.Provider>
  const admin = tab === 'admin' && !route
  return <Ctx.Provider value={ctx}>
    <header className="bar"><div className="bi">
      <Brand site={S} />
      <nav>{TABS.map(([k, v]) => <button key={k} className={tab === k && !route ? 'on' : ''} onClick={() => nav(k)}>{t(v)}</button>)}</nav>
      <Clock />
    </div></header>
    <AnnounceBar items={d.ann} />
    <main className="wrap" id="content">
      {!admin && !route && <Banner {...f} />}
      {!admin && <div className="tools">
        {!route && <select value={tid} onChange={e => setTid(e.target.value)} aria-label={t('All tournaments')}><option value="all">{t('All tournaments')}</option>{d.tours.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
        {window.Notification?.permission === 'default' && <button className="btn o sm" onClick={() => Notification.requestPermission().then(() => bump(n => n + 1))}>{t('Notify me')}</button>}
        <InstallButton />
        <span className="tsp" />
        <button className="btn o sm" onClick={switchLang} aria-label="Language" title="Bahasa / Language">{lang === 'id' ? 'EN' : 'ID'}</button>
        <button className="btn o sm" onClick={flip} aria-label={t('Dark mode')} title={t('Dark mode')}>{theme === 'dark' ? '☀' : '☾'}</button>
      </div>}
      {route && route[1] === 'match' && <MatchPage id={route[2]} matches={all} back={back} ready={d.ready} />}
      {route && route[1] === 'team' && <TeamPage id={route[2]} teams={d.teams} matches={all} tours={d.tours} back={back} ready={d.ready} />}
      {!route && tab === 'live' && <Live {...f} favs={favs} courts={courts} />}
      {!route && tab === 'schedule' && <Schedule {...f} favs={favs} onPrint={kind => setPrint({ kind })} />}
      {!route && tab === 'bracket' && <BracketPage {...f} />}
      {!route && tab === 'results' && <Results {...f} favs={favs} />}
      {admin && <Admin {...d} tid={tid} onBack={() => setTab('live')} onPrint={(kind, id) => setPrint({ kind, tid: id })} />}
    </main>
    <footer>{S.name || 'Courtline'} · {t('all times in {0}', tzLabel())}</footer>
    <nav className="tabbar">{TABS.map(([k, v]) => <button key={k} className={tab === k && !route ? 'on' : ''} onClick={() => nav(k)}><Ico k={k} />{t(v)}</button>)}</nav>
  </Ctx.Provider>
}
