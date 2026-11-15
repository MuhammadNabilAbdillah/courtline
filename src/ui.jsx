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
