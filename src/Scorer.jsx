import { useEffect, useMemo, useRef, useState } from 'react'
import { tn, fmtTime, rule, rd, activeCourts, clock } from './util'
import { pointLabel, isRace } from './score'
import { pointPatch, undoPatch } from './engine'
import { enqueue, flush, dismissError, useOutbox } from './outbox'
import { log, mname } from './AdminExtra'

// Small status light: shows whether everything typed on this phone has reached the server
export function SyncBadge() {
  const o = useOutbox(), [on, setOn] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  useEffect(() => {
    const a = () => setOn(true), b = () => setOn(false)
    window.addEventListener('online', a); window.addEventListener('offline', b)
    return () => { window.removeEventListener('online', a); window.removeEventListener('offline', b) }
  }, [])
  if (o.ops) return <button className="sync warn" onClick={() => flush()}>⟳ {o.ops} not sent yet{!on ? ' · offline' : ''}</button>
  return <span className={'sync' + (on ? '' : ' off')}>{on ? '● Synced' : '○ Offline'}</span>
}

const finalScore = (m, i) => (isRace(m) ? (m.sets[0] ? m.sets[0][i] : 0) : m.sets.map(s => s[i]).join(' '))

// Full-screen scorer for one court: two big +1 buttons, Undo, team names. Built for a phone held in one hand.
function Scorer({ court, matches, lock, onExit }) {
  const o = useOutbox(), [pick, setPick] = useState(null), [note, setNote] = useState(''), last = useRef(0), nt = useRef(null)
  const list = useMemo(() => matches.filter(m => m.court === court).sort((a, b) => new Date(a.start_at) - new Date(b.start_at)), [matches, court])
  const auto = list.find(m => m.status === 'live') || list.find(m => m.status === 'scheduled') || list[list.length - 1]
  const m = list.find(x => x.id === pick) || auto

  useEffect(() => { // keep the screen awake while scoring
    let wl = null, dead = false
    const get = async () => { try { if (navigator.wakeLock && !document.hidden) { wl = await navigator.wakeLock.request('screen'); if (dead) wl.release() } } catch { /* not supported */ } }
    get(); document.addEventListener('visibilitychange', get)
    return () => { dead = true; document.removeEventListener('visibilitychange', get); if (wl) wl.release().catch(() => {}) }
  }, [])
  useEffect(() => { document.body.classList.add('scoring'); return () => document.body.classList.remove('scoring') }, [])
  const flash = s => { setNote(s); clearTimeout(nt.current); nt.current = setTimeout(() => setNote(''), 1800) }

  const tap = i => {
    if (!m || m.status !== 'live' || m.locked) return
    const now = Date.now()
    if (now - last.current < 450) return // ignores an accidental double tap
    last.current = now
    const { patch, fin, sc } = pointPatch(m, i, lock)
    enqueue(m, patch)
    if (navigator.vibrate) navigator.vibrate(fin ? [70, 40, 70] : 30)
    flash(`+1 ${tn(i ? m.t2 : m.t1) || 'Team'} · ${sc}`)
    if (fin) { setPick(m.id); log('Match finished', `${mname(m)}: ${sc}`) }
  }
  const undo = () => {
    if (!m || m.locked) return
    const u = undoPatch(m); if (!u) return
    enqueue(m, u); flash('Last point undone')
  }
  const start = () => { enqueue(m, { status: 'live' }); log('Started match', mname(m)) }
  const lastPt = m && m.points && m.points.filter(e => e.t === 0 || e.t === 1).slice(-1)[0]
  const canUndo = m && !m.locked && m.history && m.history.length > 0 && m.status !== 'scheduled'
  const nextUp = m && m.status === 'finished' ? list.find(x => x.status !== 'finished') : null

  const side = i => {
    const tm = i ? m.t2 : m.t1, slot = i ? m.slot2 : m.slot1, live = m.status === 'live', fin = m.status === 'finished'
    const win = fin && tm && m.winner === tm.id
    const big = live ? (isRace(m) ? m.p[i] : m.g[i]) : fin ? finalScore(m, i) : '–'
    return <div key={i} className={'scp ' + (i ? 'b' : 'a') + (win ? ' win' : '')}>
      <div className="scp-name"><h2>{tn(tm) || slot || 'TBD'}</h2>{tm && <small>{tm.player1} / {tm.player2}</small>}</div>
      <div className="scp-score">{big}{live && !isRace(m) && <span>{pointLabel(m, i)}</span>}</div>
      <button className="scp-btn" disabled={!live || m.locked} onClick={() => tap(i)} aria-label={`Add a point for ${tn(tm) || 'team'}`}>+1</button>
    </div>
  }

  return <div className="scr">
    <div className="scr-top">
      <button className="btn g sm" onClick={onExit}>← Exit</button>
      <div className="scr-title"><b>{court}</b><small>{m ? `${rd(m.round)} · ${rule(m)}${m.tname ? ' · ' + m.tname : ''}` : ''}</small></div>
      <SyncBadge />
    </div>
    {list.length > 1 && <select className="scr-sel" value={m ? m.id : ''} onChange={e => setPick(e.target.value)} aria-label="Match">
      {list.map(x => <option key={x.id} value={x.id}>{fmtTime(x.start_at)} · {mname(x)}{x.status === 'live' ? ' · LIVE' : x.status === 'finished' ? ' · done' : ''}</option>)}
    </select>}
    {o.err && <div className="scr-err">{o.err} <button onClick={dismissError}>OK</button></div>}
    {!m ? <div className="scr-empty">No matches scheduled on {court}.</div> : <>
      <div className="scr-body">{side(0)}{side(1)}</div>
      <div className="scr-bot">
        <div className="scr-info">
          {note ? <b className="scr-note">{note}</b> : m.status === 'live' && lastPt ? <span>Last point: {tn(lastPt.t ? m.t2 : m.t1)} · {lastPt.sc} · {clock(lastPt.at)}</span>
            : m.status === 'scheduled' ? <span>Starts {fmtTime(m.start_at)}</span> : m.status === 'finished' ? <span>Final{m.winner ? ` · ${tn(m.winner === m.team1 ? m.t1 : m.t2)} wins` : ''}</span> : <span>0 – 0</span>}
        </div>
        <div className="scr-act">
          {m.status === 'scheduled' && <button className="btn big" disabled={!m.team1 || !m.team2} onClick={start}>Start match</button>}
          {m.status !== 'scheduled' && <button className="btn o big" disabled={!canUndo} onClick={undo}>↶ Undo</button>}
          {nextUp && <button className="btn big" onClick={() => setPick(nextUp.id)}>Next: {mname(nextUp)} →</button>}
          {m.locked && <span className="chip lock">🔒 Locked — ask an admin</span>}
        </div>
      </div>
    </>}
  </div>
}

// Scorer tab of the admin console: pick the court, then the full-screen scorer opens
export function ScorerHome({ matches, settings }) {
  const [court, setCourt] = useState(() => { try { return sessionStorage.getItem('cl-court') || '' } catch { return '' } })
  const names = useMemo(() => [...new Set([...activeCourts(settings), ...matches.filter(m => m.status !== 'finished').map(m => m.court)])], [matches, settings])
  const open = c => { setCourt(c); try { sessionStorage.setItem('cl-court', c) } catch { /* private mode */ } }
  const close = () => { setCourt(''); try { sessionStorage.removeItem('cl-court') } catch { /* private mode */ } }
  if (court) return <Scorer court={court} matches={matches} lock={!!settings.autoLock} onExit={close} />
  return <div className="panel"><h3>Scorer mode</h3>
    <p className="muted">Pick the court you are scoring. The screen goes full size with two big +1 buttons. If the signal drops, points are kept on this phone and sent automatically when it returns.</p>
    <div className="courts scc">{names.map(c => {
      const l = matches.find(m => m.court === c && m.status === 'live'), n = matches.filter(m => m.court === c && m.status === 'scheduled').sort((a, b) => new Date(a.start_at) - new Date(b.start_at))[0]
      return <button key={c} className={'ct' + (l ? ' on' : '')} onClick={() => open(c)}><b>{c}</b><p>{l ? `LIVE · ${mname(l)}` : n ? `Next ${fmtTime(n.start_at)} · ${mname(n)}` : 'No matches left'}</p></button>
    })}</div>
    {!names.length && <p className="muted">No courts yet.</p>}
  </div>
}
