// Padel scoring: 0/15/30/40, golden point (or advantage); set to 6 (win by 2) with tiebreak at 6-6,
// or "first to N games" when `target` is set.
export function addPoint(m, t, golden, bestOf, target) {
  const o = 1 - t
  const s = { sets: m.sets.map(x => [...x]), g: [...m.g], p: [...m.p], winner: null }
  s.p[t]++
  const tb = !target && s.g[0] === 6 && s.g[1] === 6
  let won
  if (tb) won = s.p[t] >= 7 && s.p[t] - s.p[o] >= 2
  else if (golden) won = s.p[t] >= 4
  else won = s.p[t] >= 4 && s.p[t] - s.p[o] >= 2
  if (won) {
    s.g[t]++; s.p = [0, 0]
    const setWon = target ? s.g[t] >= target : (s.g[t] >= 6 && s.g[t] - s.g[o] >= 2) || s.g[t] === 7
    if (setWon) {
      s.sets.push([...s.g]); s.g = [0, 0]
      if (s.sets.filter(x => x[t] > x[o]).length > bestOf / 2) s.winner = t
    }
  }
  return s
}
export function label(p, i, g, golden, target) {
  if (!target && g[0] === 6 && g[1] === 6) return String(p[i])
  if (p[0] >= 3 && p[1] >= 3) return golden || p[i] === p[1 - i] ? '40' : p[i] > p[1 - i] ? 'AD' : '40'
  return ['0', '15', '30', '40'][p[i]]
}
