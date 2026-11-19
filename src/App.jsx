import { useEffect, useState, useCallback, useRef, useContext } from 'react'
import { supabase } from './supabase'
import { Card, Clock, AnnounceBar, InstallButton, Ctx, Brand, Feature, QRCode } from './ui'
import { fmtDay, fmtTime, fmtDate, tn, rule, rd, setCfg, DEFAULTS, activeCourts, readFavs, writeFavs, hasFav, tourSub, tourLabel, slotText } from './util'
import { BracketView, virtualKO } from './Bracket'
import { GroupTable, TeamPage, MatchPage } from './Team'
import PrintSheet from './Print'
import { MyTurn, TeamsPage, CourtGrid, Countdown } from './Public'
import { InfoPage } from './Event'
import { estimates } from './turn'
import { setRankOverrides } from './standings'
import Admin from './Admin'
import { t, getLang, setLang } from './i18n'
import Home, { Champions, Courts } from './Home'

const Q = '*, t1:teams!matches_team1_fkey(*), t2:teams!matches_team2_fkey(*)'
const ICONS = {
  home: <path d="M4 11l8-7 8 7v9a1 1 0 01-1 1h-4v-6H9v6H5a1 1 0 01-1-1z" />,
  more: <><circle cx="6" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="18" cy="12" r="1.6" /></>,
  live: <><circle cx="12" cy="12" r="3" /><path d="M6.3 6.3a8 8 0 000 11.4M17.7 6.3a8 8 0 010 11.4" /></>,
  schedule: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
  bracket: <path d="M4 5h5v4H4zM4 15h5v4H4zM15 10h5v4h-5zM9 7h3v10H9M12 12h3" />,
  results: <path d="M8 4h8v5a4 4 0 01-8 0zM8 6H4v1a3 3 0 003 3M16 6h4v1a3 3 0 01-3 3M12 13v4M8 20h8" />,
  tv: <><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 21h8M12 17v4" /></>,
  teams: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0112 0M16 5a3.2 3.2 0 010 6M18 20a6 6 0 00-3-5.2" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></>,
  admin: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></>
}
const TABS = [['home', 'Home'], ['live', 'Live'], ['schedule', 'Schedule'], ['bracket', 'Bracket'], ['results', 'Results'], ['teams', 'Teams'], ['info', 'Info'], ['tv', 'TV'], ['admin', 'Admin']]
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
    const sd = (e.data && e.data.data) || {}
    setSet({ ...DEFAULTS, ...sd, name: sd.name || DEFAULTS.name, venue: sd.venue || DEFAULTS.venue, dates: sd.dates || DEFAULTS.dates }); setReady(true)
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

function Banner({ one, matches, teams, site }) {
  const live = matches.filter(m => m.status === 'live').length, today = matches.filter(m => fmtDay(m.start_at) === fmtDay(new Date())).length
  const ko = matches.some(m => m.round !== 'Group Stage')
  const kick = matches.length && !matches.some(m => m.status !== 'scheduled') ? Math.min(...matches.map(m => +new Date(m.start_at))) : 0
  return <section className="banner">
    <div>
      <small>{one ? tourSub(one) : t('PADEL LIVE SCORE')}</small>
      <h1>{one ? one.name : (site.name || t('Padel live scores'))}</h1>
      <div className="tmeta">{one && <><span>{ko ? t('Knockout Stage') : t('Group Stage')}</span>{one.start_date && <span>{fmtDate(one.start_date)}</span>}</>}{site.dates && <span>{site.dates}</span>}{site.venue && <span>{site.venue}</span>}{kick > 0 && <Countdown target={kick} />}</div>
    </div>
    <div className="bst"><div><b>{live}</b><span>{t('Live')}</span></div><div><b>{today}</b><span>{t('Today')}</span></div><div><b>{teams.length}</b><span>{t('Teams')}</span></div></div>
  </section>
}

function Live({ matches, favs, courts, tours = [], teams = [], top = null }) {
  const byFav = (a, b) => hasFav(b, favs) - hasFav(a, favs) // your teams first, otherwise time order is kept
  const live = matches.filter(m => m.status === 'live').sort(byFav), next = matches.filter(m => m.status === 'scheduled').sort(byFav).slice(0, favs.length ? 6 : 4)
  return <>
    <Champions tours={tours} matches={matches} />
    {top}
    {live[0] && <Feature m={live[0]} />}
    <h3 className="sec">{t('Live now')} <span className="chip">{live.length}</span></h3>
    {live.length ? <div className="grid">{live.map(m => <Card key={m.id} m={m} />)}</div> : <div className="empty">{t('No matches are live right now.')}</div>}
    <Courts matches={matches} courts={courts} />
    {next.length > 0 && <><h3 className="sec">{t('Up next')}</h3><div className="grid">{next.map(m => <Card key={m.id} m={m} />)}</div></>}
  </>
}

const MineToggle = ({ on, set, favs }) => favs.length > 0 && <button className={'btn sm' + (on ? '' : ' o')} onClick={() => set(!on)}>★ {t('My teams')}</button>

function Schedule({ matches, favs, onPrint, est = {}, courts = [] }) {
  const { go } = useContext(Ctx)
  const [q, setQ] = useState(''), [mine, setMine] = useState(false), [view, setView] = useState('list')
  const hit = m => (!mine || hasFav(m, favs)) &&
    (tn(m.t1) + tn(m.t2) + (slotText(m.slot1) || '') + (slotText(m.slot2) || '') + m.t1?.player1 + m.t1?.player2 + m.t2?.player1 + m.t2?.player2 + m.court + m.round).toLowerCase().includes(q.toLowerCase())
  const list = matches.filter(m => m.status !== 'finished' && hit(m))
  const days = [...new Set(list.map(m => fmtDay(m.start_at)))]
  return <>
    <h3 className="sec">{t('Schedule')}</h3>
    <div className="tools">
      <input className="search" placeholder={t('Search team, player, court or round…')} value={q} onChange={e => setQ(e.target.value)} />
      <MineToggle on={mine} set={setMine} favs={favs} />
      <button className={'btn sm' + (view === 'list' ? '' : ' o')} onClick={() => setView('list')}>{t('List')}</button>
      <button className={'btn sm' + (view === 'courts' ? '' : ' o')} onClick={() => setView('courts')}>{t('By court')}</button>
      <button className="btn o sm" onClick={() => onPrint('schedule')}>{t('Print schedule')}</button>
    </div>
    {view === 'courts' ? <CourtGrid matches={matches.filter(hit)} courts={courts} est={est} favs={favs} go={go} /> :
    days.length ? days.map(d => <div key={d}><div className="day">{d}</div><div className="card list">
      {list.filter(m => fmtDay(m.start_at) === d).map(m => <div className={'srow' + (hasFav(m, favs) ? ' fav' : '')} key={m.id}>
        <div className="st"><b>{fmtTime(m.start_at)}</b><small>{m.court}</small>{est[m.id] && est[m.id].late && m.status === 'scheduled' && <small className="late">~{fmtTime(new Date(Math.round(est[m.id].start / 3e5) * 3e5))}</small>}</div>
        <div className="sm"><b>{tn(m.t1) || slotText(m.slot1) || t('TBD')}</b> <span>{t('vs')}</span> <b>{tn(m.t2) || slotText(m.slot2) || t('TBD')}</b>
          <small>{rd(m.round)}{m.tname ? ` · ${m.tname}` : ''} · {rule(m)}</small></div>
        <span className={'badge ' + (m.status === 'live' ? 'live' : '')}>{m.status === 'live' ? t('LIVE') : t('UPCOMING')}</span></div>)}
    </div></div>) : <div className="empty">{t('No scheduled matches.')}</div>}
  </>
}

function BracketPage({ tours, teams, matches }) {
  if (!tours.length) return <div className="empty">{t('No tournaments yet.')}</div>
  return <><Champions tours={tours} matches={matches} />{tours.map(tr => {
    const tm = teams.filter(x => x.tournament_id === tr.id), ms = matches.filter(x => x.tournament_id === tr.id)
    const groups = [...new Set(tm.map(x => x.grp))].sort(), real = ms.some(m => m.round !== 'Group Stage')
    return <div key={tr.id} className="tsec">
      {tours.length > 1 && <div className="th"><h2>{tr.name}</h2><div className="tmeta"><span className="chip">{tourSub(tr)}</span></div></div>}
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

// Layar penuh untuk mode TV. Harus dipanggil dari klik pengguna (browser mewajibkan gesture).
const fsOn = () => !!(document.fullscreenElement || document.webkitFullscreenElement)
const fsEnter = () => { const e = document.documentElement; try { return (e.requestFullscreen || e.webkitRequestFullscreen)?.call(e)?.catch?.(() => {}) } catch { /* tidak didukung */ } }
const fsExit = () => { if (!fsOn()) return; try { (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)?.catch?.(() => {}) } catch { /* abaikan */ } }

function TV({ matches, ann, site, exit }) {
  const live = matches.filter(m => m.status === 'live')
  const url = location.origin + location.pathname
  const [full, setFull] = useState(fsOn())
  useEffect(() => { // sinkron saat pengguna menekan Esc / F11
    const f = () => setFull(fsOn())
    document.addEventListener('fullscreenchange', f); document.addEventListener('webkitfullscreenchange', f)
    return () => { document.removeEventListener('fullscreenchange', f); document.removeEventListener('webkitfullscreenchange', f); fsExit() }
  }, [])
  useEffect(() => { // layar TV tidak boleh mati/redup selama mode ini aktif
    let lock = null, dead = false
    const get = () => navigator.wakeLock?.request('screen').then(l => { if (dead) l.release(); else lock = l }).catch(() => {})
    const vis = () => { if (document.visibilityState === 'visible') get() }
    get(); document.addEventListener('visibilitychange', vis)
    return () => { dead = true; document.removeEventListener('visibilitychange', vis); lock?.release().catch(() => {}) }
  }, [])
  const hideCursor = useRef(null)
  useEffect(() => { // sembunyikan kursor setelah diam 3 detik
    const root = document.documentElement, show = () => { root.classList.remove('nocur'); clearTimeout(hideCursor.current); hideCursor.current = setTimeout(() => root.classList.add('nocur'), 3000) }
    show(); window.addEventListener('mousemove', show)
    return () => { window.removeEventListener('mousemove', show); clearTimeout(hideCursor.current); root.classList.remove('nocur') }
  }, [])
  return <div className="tv">
    <div className="tvh"><Brand site={site} /><Clock />
      <div className="tvq"><QRCode text={url} px={92} /><span>{t('Scan to open the live scores on your phone')}</span></div>
      <div className="tvb">
        <button className="btn g" onClick={() => full ? fsExit() : fsEnter()}>{full ? t('Exit fullscreen') : t('Fullscreen')}</button>
        <button className="btn g" onClick={() => { fsExit(); exit() }}>{t('Exit')}</button>
      </div></div>
    <AnnounceBar items={ann} tv />
    <h3 className="sec">{t('Live')}</h3>
    {live.length ? <div className={'grid tvlive' + (live.length === 1 ? ' one' : '')}>{live.map(m => <Card key={m.id} m={m} plain />)}</div> : <p className="tvempty">{t('No live matches.')}</p>}
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
  const [tab, setTab] = useState(() => location.hash === '#/admin' ? 'admin' : 'home'), [tid, setTid] = useState('all'), d = useData(), first = useRef(true)
  const [favs, setFavs] = useState(readFavs), [print, setPrint] = useState(null), [, bump] = useState(0), [now, setNow] = useState(Date.now())
  const [lang, setLangS] = useState(getLang()), [more, setMore] = useState(false)
  const [theme, setTheme] = useState(() => { try { const s = localStorage.getItem('cl-theme'); if (s) return s } catch { /* no storage */ } return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' })
  const hash = useHash(), route = /^#\/(match|team)\/([\w-]+)$/.exec(hash)
  const S = d.settings
  setCfg({ tz: S.tz, hour12: S.hour12, name: S.name }) // sebelum render, supaya semua jam memakai zona waktu acara
  setRankOverrides(S.rankOverrides) // urutan grup manual dari admin

  const brand = /^#[0-9a-f]{6}$/i.test(S.color) ? S.color : DEFAULTS.color
  document.documentElement.style.setProperty('--b', brand); document.documentElement.style.setProperty('--bd', shade(brand, .7))
  useEffect(() => { // judul, bahasa, tema
    const r = document.documentElement, c = brand
    document.title = `${S.name || 'Padel'} — ${t('Padel Live Score')}`
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', c)
    r.lang = lang; r.dataset.theme = theme
  }, [brand, S.name, lang, theme])
  useEffect(() => { // tinggi header dipakai oleh menu samping dan bar admin yang menempel
    const f = () => { const b = document.querySelector('.bar'); if (b) document.documentElement.style.setProperty('--barh', b.offsetHeight + 'px') }
    f(); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f)
  }, [])
  useEffect(() => {
    if (first.current) { first.current = false; return }
    document.getElementById('content')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [tab])
  useEffect(() => { if (route) window.scrollTo(0, 0) }, [hash])
  useEffect(() => { if (hash === '#/admin') setTab('admin') }, [hash]) // tautan #/admin selalu membuka halaman admin, yang meminta login dulu
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(i) }, [])

  const toggle = id => setFavs(f => { const n = f.includes(id) ? f.filter(x => x !== id) : [...f, id]; writeFavs(n); return n })
  const flip = () => { const n = theme === 'dark' ? 'light' : 'dark'; setTheme(n); try { localStorage.setItem('cl-theme', n) } catch { /* mode privat */ } }
  const switchLang = () => { const n = lang === 'id' ? 'en' : 'id'; setLang(n); setLangS(n) }
  const nav = k => { setMore(false); if (location.hash) location.hash = ''; if (k === 'tv') fsEnter(); setTab(k) }

  const tmap = Object.fromEntries(d.tours.map(x => [x.id, tourLabel(x)]))
  const all = d.matches.map(m => ({ ...m, tname: tmap[m.tournament_id] }))
  const pick = x => tid === 'all' || x.tournament_id === tid
  const tours = d.tours.filter(x => tid === 'all' || x.id === tid)
  const f = { tours, teams: d.teams.filter(pick), matches: d.matches.filter(pick).map(m => ({ ...m, tname: tid === 'all' ? tmap[m.tournament_id] : null })), one: tid === 'all' ? null : tours[0] }
  const ctx = { favs, toggle, go }
  const courts = activeCourts(S), est = estimates(d.matches, now), info = tab === 'info' && !route
  const openTour = (id, k) => { setTid(id); nav(k) }

  if (print) return <PrintSheet kind={print.kind} tours={d.tours} teams={d.teams} matches={all} tid={print.tid ?? tid} site={S} onClose={() => setPrint(null)} />
  if (tab === 'tv') return <Ctx.Provider value={ctx}><TV matches={f.matches} ann={d.ann} site={S} exit={() => setTab('home')} /></Ctx.Provider>
  const admin = tab === 'admin' && !route, home = tab === 'home' && !route
  const MAIN = ['home', 'live', 'schedule', 'bracket', 'results'], MORE = ['teams', 'info', 'tv', 'admin']
  const NavBtn = ({ k, v, cls }) => <button className={cls || ''} onClick={() => nav(k)} aria-current={tab === k && !route ? 'page' : undefined}><Ico k={k} /><span>{t(v)}</span></button>
  return <Ctx.Provider value={ctx}>
    <header className="bar"><div className="bi">
      <Brand site={S} />
      <span className="tsp" />
      <button className="lang" onClick={switchLang} aria-label={t('Language')} title={t('Language')}><b className={lang === 'id' ? 'on' : ''}>ID</b><b className={lang === 'en' ? 'on' : ''}>EN</b></button>
      <Clock />
    </div></header>
    {!admin && <AnnounceBar items={d.ann} />}
    <div className={'shell' + (admin ? ' noside' : '')}>
      {!admin && <aside className="side"><nav aria-label={t('Menu')}>
        {TABS.map(([k, v]) => <button key={k} className={(tab === k && !route ? 'on' : '') + (k === 'admin' ? ' adm-link' : '')} onClick={() => nav(k)} aria-current={tab === k && !route ? 'page' : undefined}><Ico k={k} /><span>{k === 'admin' ? t('Staff login') : t(v)}</span></button>)}
      </nav></aside>}
      <main className="wrap" id="content">
        {!admin && !route && !info && <Banner {...f} site={S} />}
        {!admin && <div className="tools">
          {!route && !info && <select value={tid} onChange={e => setTid(e.target.value)} aria-label={t('All categories')}><option value="all">{t('All categories')}</option>{d.tours.map(x => <option key={x.id} value={x.id}>{tourLabel(x)}</option>)}</select>}
          {window.Notification?.permission === 'default' && <button className="btn o sm" onClick={() => Notification.requestPermission().then(() => bump(n => n + 1))}>{t('Notify me')}</button>}
          <InstallButton />
          <span className="tsp" />
          <button className="btn o sm" onClick={flip} aria-label={t('Dark mode')} title={t('Dark mode')}>{theme === 'dark' ? '☀' : '☾'}</button>
        </div>}
        {route && route[1] === 'match' && <MatchPage id={route[2]} matches={all} back={back} ready={d.ready} />}
        {route && route[1] === 'team' && <TeamPage id={route[2]} teams={d.teams} matches={all} tours={d.tours} back={back} ready={d.ready} est={est} />}
        {home && <Home {...f} allTours={d.tours} allTeams={d.teams} allMatches={all} favs={favs} courts={courts} est={est} go={go} nav={nav} openTour={openTour} />}
        {!route && tab === 'live' && <Live {...f} favs={favs} courts={courts} top={<MyTurn favs={favs} teams={d.teams} matches={all} est={est} go={go} toTeams={() => nav('teams')} />} />}
        {!route && tab === 'schedule' && <Schedule {...f} favs={favs} est={est} courts={courts} onPrint={kind => setPrint({ kind })} />}
        {!route && tab === 'bracket' && <BracketPage {...f} />}
        {!route && tab === 'results' && <Results {...f} favs={favs} />}
        {!route && tab === 'teams' && <TeamsPage teams={f.teams} tours={f.tours} matches={f.matches} favs={favs} toggle={toggle} go={go} />}
        {info && <InfoPage site={S} matches={all} onTv={() => nav('tv')} />}
        {admin && <Admin {...d} tid={tid} onBack={() => setTab('home')} onPrint={(kind, id) => setPrint({ kind, tid: id })} />}
      </main>
    </div>
    <footer>{S.name || 'Padel'}</footer>
    {!admin && <nav className="tabbar" aria-label={t('Menu')}>
      {MAIN.map(k => <NavBtn key={k} k={k} v={TABS.find(x => x[0] === k)[1]} cls={tab === k && !route ? 'on' : ''} />)}
      <button className={more || (MORE.includes(tab) && !route) ? 'on' : ''} onClick={() => setMore(!more)} aria-expanded={more}><Ico k="more" /><span>{t('More')}</span></button>
    </nav>}
    {more && !admin && <div className="msh" onClick={() => setMore(false)}><div className="msp" role="dialog" aria-label={t('More')} onClick={e => e.stopPropagation()}>
      <div className="mshh"><b>{t('More')}</b><button className="drx" onClick={() => setMore(false)} aria-label={t('Close')}>×</button></div>
      <div className="msg">{MORE.map(k => <button key={k} onClick={() => nav(k)} className={tab === k ? 'on' : ''}><Ico k={k} /><span>{k === 'admin' ? t('Staff login') : t(TABS.find(x => x[0] === k)[1])}</span></button>)}</div>
      <div className="mst"><button className="btn o sm" onClick={switchLang}>{t('Language')}: {lang === 'id' ? 'Indonesia' : 'English'}</button><button className="btn o sm" onClick={flip}>{t('Dark mode')} {theme === 'dark' ? '☀' : '☾'}</button></div>
    </div></div>}
  </Ctx.Provider>
}
