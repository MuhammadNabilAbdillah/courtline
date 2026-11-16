// Two scoring systems:
//  - race: "Race to N points" (N = target). A plain point counter, the first team to reach N wins. The final score is stored as one set, e.g. [[6, 4]].
//  - tennis style: 0/15/30/40, golden point (or advantage); set to 6 (win by 2) with tiebreak at 6-6, or "first to N games" when `target` is set.
export function addPoint(m, t, golden, bestOf, target, race) {
  const o = 1 - t
  const s = { sets: m.sets.map(x => [...x]), g: [...m.g], p: [...m.p], winner: null }
  s.p[t]++
  if (race) {
    if (s.p[t] >= target) { s.sets = [[s.p[0], s.p[1]]]; s.p = [0, 0]; s.winner = t }
    return s
  }
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

// Works out who has won the match from manually entered sets: 0 = team 1, 1 = team 2, null = not decided yet.
export function settle(sets, bestOf) {
  const a = sets.filter(s => s[0] > s[1]).length, b = sets.filter(s => s[1] > s[0]).length
  return a > bestOf / 2 ? 0 : b > bestOf / 2 ? 1 : null
}

// What to show for a team's current points on a live match (a plain number in a race, 0/15/30/40 otherwise)
export const pointLabel = (m, i) => m.scoring === 'race' ? String(m.p[i]) : label(m.p, i, m.g, m.golden, m.target)
export const isRace = m => m.scoring === 'race'
