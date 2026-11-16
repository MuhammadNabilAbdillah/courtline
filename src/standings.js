export const WIN_PTS = 3 // points per win in group stage

// Manual group orders set by an admin (Admin > Standings). Kept in the settings row and pushed in from App.
let OVR = {}
export const setRankOverrides = o => { OVR = o || {} }
export const rankKey = (tid, grp) => `${tid}:${grp}`

// Group table. Order: wins (3 pts each) -> head-to-head among the tied teams -> point difference -> points scored -> name.
// An admin can replace the whole order for a group with a manual ranking.
// The returned array also carries: complete (all group matches played), unresolved (a tie the rules above cannot split), manual.
export function table(teams, matches) {
  const rows = teams.map(t => ({ t, g: 0, w: 0, l: 0, tie: 0, gw: 0, gl: 0, pts: 0 }))
  const by = Object.fromEntries(rows.map(r => [r.t.id, r]))
  const gm = matches.filter(m => m.round === 'Group Stage' && by[m.team1] && by[m.team2])
  const h2h = {} // "a|b" -> { winner, diff for team1 }
  gm.filter(m => m.status === 'finished').forEach(m => {
    const a = by[m.team1], b = by[m.team2]
    const ga = m.sets.reduce((x, s) => x + s[0], 0), gb = m.sets.reduce((x, s) => x + s[1], 0)
    a.g++; b.g++; a.gw += ga; a.gl += gb; b.gw += gb; b.gl += ga
    const [win, lose] = m.winner === m.team1 ? [a, b] : [b, a]
    win.w++; lose.l++; win.pts += WIN_PTS
    ;(h2h[m.team1 + '|' + m.team2] = h2h[m.team1 + '|' + m.team2] || []).push({ a: m.team1, b: m.team2, ga, gb, win: m.winner })
  })
  const all = Object.values(h2h).flat()
  rows.forEach(r => { r.diff = r.gw - r.gl })

  // head-to-head record of every team against the other teams that have the same number of points
  const mini = r => {
    const peers = new Set(rows.filter(x => x.pts === r.pts).map(x => x.t.id))
    let w = 0, d = 0
    all.forEach(m => {
      if (!peers.has(m.a) || !peers.has(m.b) || (m.a !== r.t.id && m.b !== r.t.id)) return
      const mine = m.a === r.t.id
      if (m.win === r.t.id) w++
      d += mine ? m.ga - m.gb : m.gb - m.ga
    })
    return { w, d }
  }
  rows.forEach(r => { const h = mini(r); r.hw = h.w; r.hd = h.d })
  const name = r => r.t.name || ''
  rows.sort((x, y) => y.pts - x.pts || y.hw - x.hw || y.hd - x.hd || y.diff - x.diff || y.gw - x.gw || name(x).localeCompare(name(y)))

  const complete = gm.length > 0 && gm.every(m => m.status === 'finished')
  const same = (x, y) => x.pts === y.pts && x.hw === y.hw && x.hd === y.hd && x.diff === y.diff && x.gw === y.gw
  rows.forEach(r => { r.unresolved = rows.some(o => o !== r && same(o, r)) })

  const first = teams[0], man = first && OVR[rankKey(first.tournament_id, first.grp)]
  let out = rows
  if (man && man.length) {
    const pos = id => { const i = man.indexOf(id); return i < 0 ? 999 : i }
    out = [...rows].sort((x, y) => pos(x.t.id) - pos(y.t.id)) // stable: teams missing from the manual list keep the computed order
  }
  out.complete = complete
  out.unresolved = complete && !(man && man.length) && rows.some(r => r.unresolved)
  out.manual = !!(man && man.length)
  return out
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
