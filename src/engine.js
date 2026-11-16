import { addPoint, isRace } from './score'
import { scoreText } from './util'

// The "points" column (point-by-point log) only exists after the latest supabase.sql has been run.
// Every helper below only touches it when the match row already has it, so nothing breaks before the update.
export const hasLog = m => 'points' in m
export const logReset = m => (hasLog(m) ? { points: [] } : {})
export const logAdd = (m, entry) => (hasLog(m) ? { points: [...(m.points || []), entry].slice(-300) } : {})
const plain = m => scoreText(m).replace('*', '').replace('  WO', '').trim()

// Result of one point for team t (0 or 1): the database patch, whether the match ended, and the new score.
export function pointPatch(m, t, lock) {
  const cur = { sets: m.sets, g: m.g, p: m.p }
  const n = addPoint(cur, t, m.golden, m.best_of, m.target, isRace(m)), fin = n.winner !== null
  const next = { ...m, sets: n.sets, g: n.g, p: n.p, status: fin ? 'finished' : 'live', wo: false }
  const sc = plain(next)
  return {
    fin, sc,
    patch: {
      sets: n.sets, g: n.g, p: n.p, history: [...(m.history || []).slice(-30), cur],
      status: next.status, winner: fin ? (n.winner ? m.team2 : m.team1) : null,
      ...(fin && lock ? { locked: true } : {}),
      ...logAdd(m, { t, at: Date.now(), sc })
    }
  }
}

// Takes the last point back (null when there is nothing to undo)
export function undoPatch(m) {
  const h = [...(m.history || [])], prev = h.pop()
  if (!prev) return null
  return { ...prev, history: h, status: 'live', winner: null, wo: false, ...(hasLog(m) ? { points: dropLastPoint(m.points || []) } : {}) }
}
// removes the newest point entry (corrections made by hand are kept)
function dropLastPoint(list) {
  const a = [...list]
  for (let i = a.length - 1; i >= 0; i--) if (a[i].t === 0 || a[i].t === 1) { a.splice(i, 1); break }
  return a
}
