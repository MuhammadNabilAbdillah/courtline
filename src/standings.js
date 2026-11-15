export const WIN_PTS = 3 // points per win in group stage
export function table(teams, matches) {
  const rows = teams.map(t => ({ t, g: 0, w: 0, l: 0, tie: 0, gw: 0, gl: 0, pts: 0 }))
  const by = Object.fromEntries(rows.map(r => [r.t.id, r]))
  matches.filter(m => m.status === 'finished' && m.round === 'Group Stage').forEach(m => {
    const a = by[m.team1], b = by[m.team2]; if (!a || !b) return
    const ga = m.sets.reduce((x, s) => x + s[0], 0), gb = m.sets.reduce((x, s) => x + s[1], 0)
    a.g++; b.g++; a.gw += ga; a.gl += gb; b.gw += gb; b.gl += ga
    const [win, lose] = m.winner === m.team1 ? [a, b] : [b, a]
    win.w++; lose.l++; win.pts += WIN_PTS
  })
  return rows.map(r => ({ ...r, diff: r.gw - r.gl }))
    .sort((x, y) => y.pts - x.pts || y.diff - x.diff || y.gw - x.gw || (x.t.name || '').localeCompare(y.t.name || ''))
}
// Turns a placeholder label ("1st Group A", "Winner SF1", "Loser SF1") into a team id, or null if not decided yet.
export function resolve(label, teams, matches) {
  let m = /^(\d)\w\w Group (\w+)$/.exec(label || '')
  if (m) {
    const gt = teams.filter(t => t.grp === m[2])
    const gm = matches.filter(x => x.round === 'Group Stage' && gt.some(t => t.id === x.team1))
    if (!gm.length || gm.some(x => x.status !== 'finished')) return null
    return table(gt, matches)[+m[1] - 1]?.t.id || null
  }
  m = /^(Winner|Loser) (\w+)$/.exec(label || '')
  if (m) {
    const x = matches.find(y => y.code === m[2])
    if (!x || x.status !== 'finished') return null
    return m[1] === 'Winner' ? x.winner : (x.winner === x.team1 ? x.team2 : x.team1)
  }
  return null
}
