// Estimated start time of every unfinished match, worked out court by court:
// a match cannot start before the match before it on the same court has ended, so delays carry forward.
export function estimates(matches, now = Date.now()) {
  const out = {}, byCourt = {}
  matches.forEach(m => { if (m.status !== 'finished') (byCourt[m.court] = byCourt[m.court] || []).push(m) })
  Object.values(byCourt).forEach(list => {
    list.sort((a, b) => new Date(a.start_at) - new Date(b.start_at))
    let free = now
    list.forEach((m, i) => {
      const sched = new Date(m.start_at).getTime(), dur = (m.duration || 30) * 6e4
      let start, end
      if (m.status === 'live') { start = Math.min(sched, now); end = Math.max(sched + dur, now + 2 * 6e4) }
      else { start = Math.max(sched, free); end = start + dur }
      free = end
      out[m.id] = { start, ahead: i, late: start - sched > 5 * 6e4 }
    })
  })
  return out
}

// The next unfinished match of a team (live first, then the earliest estimated start)
export function nextFor(teamId, matches, est) {
  const mine = matches.filter(m => m.status !== 'finished' && (m.team1 === teamId || m.team2 === teamId) && est[m.id])
  mine.sort((a, b) => est[a.id].start - est[b.id].start)
  return mine[0] ? { m: mine[0], e: est[mine[0].id] } : null
}
