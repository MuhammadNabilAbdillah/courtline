import { makeXlsx } from './xlsx'
import { table } from './standings'
import { tn, fmtDate, fmtTime, scoreText } from './util'

const save = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000) }

// Excel workbook with standings, all matches and the team list (for reports)
export function exportXlsx({ tours, teams, matches, tid }) {
  const ts = tid === 'all' ? tours : tours.filter(x => x.id === tid)
  const standings = [['Tournament', 'Group', 'Rank', 'Team', 'Players', 'Played', 'Won', 'Lost', 'Games won', 'Games lost', 'Game diff', 'Points']]
  const results = [['Tournament', 'Round', 'Date', 'Time', 'Court', 'Team A', 'Team B', 'Score', 'Winner', 'Status', 'Walkover', 'Referee', 'Notes']]
  const roster = [['Tournament', 'Group', 'Team', 'Player 1', 'Player 2']]
  ts.forEach(tour => {
    const tm = teams.filter(x => x.tournament_id === tour.id), ms = matches.filter(x => x.tournament_id === tour.id)
    ;[...new Set(tm.map(x => x.grp))].sort().forEach(g => table(tm.filter(x => x.grp === g), ms).forEach((r, i) =>
      standings.push([tour.name, g, i + 1, tn(r.t), `${r.t.player1} / ${r.t.player2}`, r.g, r.w, r.l, r.gw, r.gl, r.diff, r.pts])))
    ms.forEach(m => results.push([tour.name, m.round, fmtDate(m.start_at), fmtTime(m.start_at), m.court, tn(m.t1) || m.slot1 || 'TBD', tn(m.t2) || m.slot2 || 'TBD',
      scoreText(m).replace('  WO', ''), m.status === 'finished' ? tn(m.winner === m.team1 ? m.t1 : m.t2) || '' : '', m.status, m.wo ? 'Yes' : '', m.referee || '', m.notes || '']))
    tm.forEach(x => roster.push([tour.name, x.grp, tn(x), x.player1, x.player2]))
  })
  save(makeXlsx([{ name: 'Standings', rows: standings }, { name: 'Matches', rows: results }, { name: 'Teams', rows: roster }]), `courtline-report-${new Date().toISOString().slice(0, 10)}.xlsx`)
}
