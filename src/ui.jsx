import { useEffect, useState } from 'react'
import { fmtTime, clock, fmtFull, ini, share, tn } from './util'
import { label } from './score'

export function Clock() {
  const [n, setN] = useState(new Date())
  useEffect(() => { const i = setInterval(() => setN(new Date()), 1000); return () => clearInterval(i) }, [])
  return <div className="clock"><b>{clock(n)} <small>WITA</small></b><span>{fmtFull(n)}</span></div>
}

export function Card({ m, children }) {
  const live = m.status === 'live', done = m.status === 'finished'
  return (
    <div className={'card' + (live ? ' live' : '')}>
      <div className="meta">
        <span className={'badge ' + (live ? 'live' : '')}>{live ? 'LIVE' : done ? 'FINAL' : 'UPCOMING'}</span>
        <span>{m.court} · {m.round}</span><span>{fmtTime(m.start_at)}</span>
        <button className="link" onClick={() => share(m)}>Share</button>
      </div>
      {m.tname && <div className="tn">{m.tname}</div>}
      {[[m.t1, 0, m.slot1], [m.t2, 1, m.slot2]].map(([t, i, slot]) => (
        <div key={i} className={'row' + (done && m.winner === t?.id ? ' win' : '')}>
          <div className="mini">{ini(tn(t) || slot)}</div>
          <div className="tm"><b>{tn(t) || slot || 'TBD'}</b><small>{t ? `${t.player1} / ${t.player2}` : 'To be decided'}</small></div>
          {m.sets.map((s, k) => <span key={k} className="set">{s[i]}</span>)}
          {live && <><span className="set cur">{m.g[i]}</span><span className="pt">{label(m.p, i, m.g, m.golden, m.target)}</span></>}
        </div>
      ))}
      {children}
    </div>
  )
}

// Announcement banner. Viewers can dismiss an announcement for the current session; the TV screen always shows them.
const hidden = () => { try { return JSON.parse(sessionStorage.getItem('cl-ann') || '[]') } catch { return [] } }
export function AnnounceBar({ items, tv }) {
  const [hid, setHid] = useState(hidden)
  const list = (items || []).filter(a => a.active && (tv || !hid.includes(a.id)))
  if (!list.length) return null
  const close = id => { const n = [...hid, id]; setHid(n); try { sessionStorage.setItem('cl-ann', JSON.stringify(n)) } catch { /* private mode */ } }
  return <div className={'ann' + (tv ? ' tv' : '')}>{list.map(a => <div key={a.id} className={'an ' + a.level} role="status">
    <b>{a.level === 'warning' ? 'IMPORTANT' : 'NOTICE'}</b><p>{a.message}</p>
    {!tv && <button className="x" aria-label="Dismiss" onClick={() => close(a.id)}>×</button>}
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
    if (!ev) return alert('To install: tap the Share button in Safari, then choose "Add to Home Screen".')
    ev.prompt(); await ev.userChoice.catch(() => {}); window.__bip = null; setEv(null)
  }
  return <button className="btn o sm" onClick={go}>Install app</button>
}
