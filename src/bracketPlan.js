// Perencana bagan gugur (single elimination). Fungsi murni, tanpa React / database, supaya mudah diuji.
// Slot bagan: { team: id } (tim sudah pasti) | { slot: '1st Group A' } (menunggu klasemen grup) | null (bye / kosong)

export const SIZES = [2, 4, 8, 16]
const ROUND_BY_SIZE = { 2: 'Final', 4: 'Semifinal', 8: 'Quarterfinal', 16: 'Round of 16' }
const PREFIX = { 16: 'R', 8: 'QF', 4: 'SF', 2: 'F' }
export const ROUND_ORDER = ['Round of 16', 'Quarterfinal', 'Semifinal', 'Third Place', 'Final']

export const bracketSize = n => { let s = 2; while (s < n) s *= 2; return s }

// Urutan seed standar: seed 1 bertemu seed terakhir, dst. size 8 -> [1,8,4,5,2,7,3,6]
export function seedOrder(size) {
  let o = [1, 2]
  while (o.length < size) { const n = o.length * 2; o = o.flatMap(x => [x, n + 1 - x]) }
  return o
}

const shuffle = a => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]] } return x }

// Menaruh daftar seed (urut dari seed 1) ke slot bagan; seed yang tidak ada = bye untuk seed teratas.
export function placeSeeds(seeds, size) {
  const order = seedOrder(size)
  return order.map(s => seeds[s - 1] || null)
}
// Acak: urutan seed diacak lalu ditempatkan (bye tetap tersebar rapi)
export const shuffleSlots = (seeds, size) => placeSeeds(shuffle(seeds), size)

const ord = n => (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th')
// Lolos dari klasemen grup: q tim teratas tiap grup, disilang supaya satu grup tidak langsung bertemu
export function groupSeeds(groups, q) {
  const gs = [...groups].sort(), out = []
  for (let r = 1; r <= q; r++) gs.forEach(g => out.push({ slot: `${r}${ord(r)} Group ${g}` }))
  return out
}

// slots: array panjang `size` (pasangan 2j, 2j+1). Hasil: daftar pertandingan baru, urut per babak.
export function planBracket(slots, { third = true } = {}) {
  const size = slots.length, matches = []
  let prev = slots.map(s => s || null), made = {}
  while (prev.length >= 2) {
    const round = ROUND_BY_SIZE[prev.length], pre = PREFIX[prev.length], next = []
    for (let j = 0; j < prev.length / 2; j++) {
      const a = prev[2 * j], b = prev[2 * j + 1]
      if (!a && !b) { next.push(null); continue }
      if (!a || !b) { next.push(a || b); continue } // bye: lawan tidak ada, langsung lolos
      const code = prev.length === 2 ? 'F' : pre + (j + 1)
      matches.push({ code, round, team1: a.team || null, team2: b.team || null, slot1: a.slot || null, slot2: b.slot || null })
      made[code] = true
      next.push({ slot: `Winner ${code}` })
    }
    prev = next
  }
  if (third && made.SF1 && made.SF2) matches.push({ code: 'TP', round: 'Third Place', team1: null, team2: null, slot1: 'Loser SF1', slot2: 'Loser SF2' })
  return matches
}

// Memberi lapangan + jam mulai. Babak berikutnya dimulai setelah babak sebelumnya selesai.
// start: epoch ms, len: menit per pertandingan, gap: jeda antar babak (menit)
export function scheduleBracket(matches, { start, len, gap = 10, courts }) {
  const stages = [...new Set(matches.map(m => (m.round === 'Third Place' ? 'Final' : m.round)))]
    .sort((a, b) => ROUND_ORDER.indexOf(a) - ROUND_ORDER.indexOf(b))
  let t = start
  const out = []
  stages.forEach(st => {
    const list = matches.filter(m => (m.round === 'Third Place' ? 'Final' : m.round) === st)
      .sort((a, b) => ROUND_ORDER.indexOf(a.round) - ROUND_ORDER.indexOf(b.round) || a.code.localeCompare(b.code))
    list.forEach((m, i) => out.push({ ...m, court: courts[i % courts.length], at: t + Math.floor(i / courts.length) * len * 6e4 }))
    t += Math.ceil(list.length / courts.length) * len * 6e4 + gap * 6e4
  })
  return out
}
