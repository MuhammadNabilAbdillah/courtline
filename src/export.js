import { makeXlsx } from './xlsx'
import { table } from './standings'
import { tn, fmtDate, fmtTime, scoreText, slotText, rd } from './util'

const save = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000) }

// Excel berisi klasemen, semua pertandingan, dan daftar tim
export function exportXlsx({ tours, teams, matches, tid }) {
  const ts = tid === 'all' ? tours : tours.filter(x => x.id === tid)
  const standings = [['Kategori', 'Grup', 'Peringkat', 'Tim', 'Pemain', 'Main', 'Menang', 'Kalah', 'Game menang', 'Game kalah', 'Selisih game', 'Poin']]
  const results = [['Kategori', 'Babak', 'Tanggal', 'Jam', 'Lapangan', 'Tim A', 'Tim B', 'Skor', 'Pemenang', 'Status', 'Walkover', 'Wasit', 'Catatan']]
  const roster = [['Kategori', 'Grup', 'Tim', 'Pemain 1', 'Pemain 2']]
  ts.forEach(tour => {
    const tm = teams.filter(x => x.tournament_id === tour.id), ms = matches.filter(x => x.tournament_id === tour.id)
    ;[...new Set(tm.map(x => x.grp))].sort().forEach(g => table(tm.filter(x => x.grp === g), ms).forEach((r, i) =>
      standings.push([tour.name, g, i + 1, tn(r.t), `${r.t.player1} / ${r.t.player2}`, r.g, r.w, r.l, r.gw, r.gl, r.diff, r.pts])))
    ms.forEach(m => results.push([tour.name, rd(m.round), fmtDate(m.start_at), fmtTime(m.start_at), m.court, tn(m.t1) || slotText(m.slot1) || 'Belum ada', tn(m.t2) || slotText(m.slot2) || 'Belum ada',
      scoreText(m).replace('  WO', ''), m.status === 'finished' ? tn(m.winner === m.team1 ? m.t1 : m.t2) || '' : '', ({ finished: 'Selesai', live: 'Live', scheduled: 'Belum main' }[m.status] || m.status), m.wo ? 'Ya' : '', m.referee || '', m.notes || '']))
    tm.forEach(x => roster.push([tour.name, x.grp, tn(x), x.player1, x.player2]))
  })
  save(makeXlsx([{ name: 'Klasemen', rows: standings }, { name: 'Pertandingan', rows: results }, { name: 'Tim', rows: roster }]), `courtline-laporan-${new Date().toISOString().slice(0, 10)}.xlsx`)
}
