import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { fmtTime, clock, fmtFull, ini, share, tn, rule, rd } from './util'
import { label, pointLabel, isRace } from './score'
import { t } from './i18n'
import { qrMatrix } from './qr'

// favourites + navigation shared with every card (set in App)
export const Ctx = createContext({ favs: [], toggle: () => {}, go: () => {} })

export function Clock() {
  const [n, setN] = useState(new Date())
  useEffect(() => { const i = setInterval(() => setN(new Date()), 1000); return () => clearInterval(i) }, [])
  return <div className="clock"><b>{clock(n)}</b><span>{fmtFull(n)}</span></div>
}

// Logo + event name (both can be changed in Admin > Settings > Site)
export function Brand({ site }) {
  const mark = site.logo
    ? <img className="blogo" src={site.logo} alt="" />
    : <svg width="28" height="28" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="#fff" /><circle cx="16" cy="16" r="8" fill="none" style={{ stroke: 'var(--b)' }} strokeWidth="2.6" /><path d="M9 12c4 1 10 1 14 0M9 20c4-1 10-1 14 0" style={{ stroke: 'var(--b)' }} strokeWidth="1.6" fill="none" /></svg>
  return <div className="logo">{mark}{site.name ? <b className="bname">{site.name}</b> : <>Court<span>line</span></>}</div>
}

const Star = ({ id }) => {
  const { favs, toggle } = useContext(Ctx), on = favs.includes(id)
  return <button className={'star' + (on ? ' on' : '')} aria-pressed={on} aria-label={on ? t('Remove from favourites') : t('Add to favourites')} title={on ? t('Remove from favourites') : t('Add to favourites')} onClick={() => toggle(id)}>{on ? '★' : '☆'}</button>
}

export function Card({ m, children, plain }) {
  const { favs, go } = useContext(Ctx)
  const live = m.status === 'live', done = m.status === 'finished'
  const fav = !plain && [m.team1, m.team2].some(x => x && favs.includes(x))
  return (
    <div className={'card' + (live ? ' live' : '') + (fav ? ' fav' : '')}>
      <div className="meta">
        <span className={'badge ' + (live ? 'live' : '')}>{live ? t('LIVE') : done ? t('FINAL') + (m.wo ? ' · WO' : '') : t('UPCOMING')}</span>
        <span>{m.court} · {rd(m.round)}</span><span>{fmtTime(m.start_at)}</span>
        {!plain && <button className="link" onClick={() => go('/match/' + m.id)}>{t('Open')}</button>}
        <button className="link" onClick={() => share(m)}>{t('Share')}</button>
      </div>
      {m.tname && <div className="tn">{m.tname}</div>}
      {[[m.t1, 0, m.slot1], [m.t2, 1, m.slot2]].map(([team, i, slot]) => (
        <div key={i} className={'row' + (done && m.winner === team?.id ? ' win' : '')}>
          <div className="mini">{ini(tn(team) || slot)}</div>
          <div className="tm">
            <b>{team && !plain ? <button className="tl" onClick={() => go('/team/' + team.id)}>{tn(team)}</button> : (tn(team) || slot || t('TBD'))}</b>
            <small>{team ? `${team.player1} / ${team.player2}` : t('To be decided')}</small>
          </div>
          {team && !plain && <Star id={team.id} />}
          {m.sets.map((s, k) => <span key={k} className="set">{s[i]}</span>)}
          {live && (isRace(m) ? <span className="set cur">{m.p[i]}</span> : <><span className="set cur">{m.g[i]}</span><span className="pt">{pointLabel(m, i)}</span></>)}
        </div>
      ))}
      {(m.wo || m.referee || m.notes) && <div className="mnote">
        {m.wo && <span className="chip">{t('Won by walkover')}</span>}
        {m.referee && <span><b>{t('Referee')}:</b> {m.referee}</span>}
        {m.notes && <span>{m.notes}</span>}
      </div>}
      {children}
    </div>
  )
}

// Big live scoreboard
export function Feature({ m }) {
  const race = isRace(m), n = m.sets.length + 1, cols = { gridTemplateColumns: '1fr' + ' 3.75rem'.repeat(n) }
  const team = (tm, slot, i) => <div className={'tmx' + (i ? ' r' : '')}><div className="av">{ini(tn(tm) || slot)}</div><div><h3>{tn(tm) || slot || t('TBD')}</h3><small>{tm ? `${tm.player1} / ${tm.player2}` : ''}</small></div></div>
  return <div className="feature">
    <div className="fh"><span className="badge live">{t('LIVE')}</span><span>{m.tname ? m.tname + ' · ' : ''}{m.court} · {rd(m.round)} · {rule(m)}{!race && ` · ${m.golden ? t('Golden point') : t('Advantage')}`}</span><button className="btn g sm" onClick={() => share(m)}>{t('Share')}</button></div>
    <div className="sb">{team(m.t1, m.slot1, 0)}
      <div><div className="lbl">{race ? t('SCORE') : t('CURRENT GAME')}</div><div className="pts"><b>{pointLabel(m, 0)}</b><span>:</span><b className="dim">{pointLabel(m, 1)}</b></div></div>
      {team(m.t2, m.slot2, 1)}</div>
    <div className="scroll"><div className="tbl" style={cols}>
      <div className="h">{t('TEAM')}</div>{m.sets.map((_, k) => <div key={k} className="h c">{t('SET')} {k + 1}</div>)}<div className="h c">{race ? t('POINTS') : t('GAME')}</div>
      {[[m.t1, m.slot1, 0], [m.t2, m.slot2, 1]].map(([tm, s, i]) => [<div key={'n' + i}>{tn(tm) || s}</div>, ...m.sets.map((x, k) => <div key={k} className="c">{x[i]}</div>), <div key={'g' + i} className="c on">{race ? m.p[i] : m.g[i]}</div>])}
    </div></div>
  </div>
}

// Announcement banner. Viewers can dismiss an announcement for the current session; the TV screen always shows them.
const hidden = () => { try { return JSON.parse(sessionStorage.getItem('cl-ann') || '[]') } catch { return [] } }
export function AnnounceBar({ items, tv }) {
  const [hid, setHid] = useState(hidden)
  const list = (items || []).filter(a => a.active && (tv || !hid.includes(a.id)))
  if (!list.length) return null
  const close = id => { const n = [...hid, id]; setHid(n); try { sessionStorage.setItem('cl-ann', JSON.stringify(n)) } catch { /* private mode */ } }
  return <div className={'ann' + (tv ? ' tv' : '')}>{list.map(a => <div key={a.id} className={'an ' + a.level} role="status">
    <b>{a.level === 'warning' ? t('IMPORTANT') : t('NOTICE')}</b><p>{a.message}</p>
    {!tv && <button className="x" aria-label={t('Dismiss')} onClick={() => close(a.id)}>×</button>}
  </div>)}</div>
}

// "Install app" button: uses the browser's install prompt (Android/Chrome/Edge) or explains Add to Home Screen on iPhone.
export function InstallButton() {
  const [ev, setEv] = useState(window.__bip || null), [done, setDone] = useState(false)
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream
  useEffect(() => {
    const on = e => { e.preventDefault(); window.__bip = e; setEv(e) }
    const ins = () => { window.__bip = null; setEv(null); setDone(true) }
    window.addEventListener('beforeinstallprompt', on); window.addEventListener('appinstalled', ins)
    return () => { window.removeEventListener('beforeinstallprompt', on); window.removeEventListener('appinstalled', ins) }
  }, [])
  if (standalone || done || (!ev && !ios)) return null
  const go = async () => {
    if (!ev) return alert(t('To install: tap the Share button in Safari, then choose "Add to Home Screen".'))
    ev.prompt(); await ev.userChoice.catch(() => {}); window.__bip = null; setEv(null)
  }
  return <button className="btn o sm" onClick={go}>{t('Install app')}</button>
}

// QR code drawn as one SVG path (used on the TV screen)
export function QRCode({ text, px = 150 }) {
  const m = useMemo(() => { try { return qrMatrix(text) } catch { return null } }, [text])
  if (!m) return null
  const n = m.length, q = 3
  let d = ''
  m.forEach((row, y) => { let x = 0; while (x < n) { if (row[x]) { let e = x; while (e < n && row[e]) e++; d += `M${x + q} ${y + q}h${e - x}v1h-${e - x}z`; x = e } else x++ } })
  return <svg className="qr" width={px} height={px} viewBox={`0 0 ${n + q * 2} ${n + q * 2}`} role="img" aria-label="QR code" shapeRendering="crispEdges"><rect width="100%" height="100%" fill="#fff" /><path d={d} fill="#000" /></svg>
}
