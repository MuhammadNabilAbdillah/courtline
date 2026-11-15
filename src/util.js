// All times are shown in WITA (Asia/Makassar, UTC+8) regardless of the viewer's device.
export const TZ = 'Asia/Makassar'
const f = (d, o) => new Date(d).toLocaleString('en-GB', { timeZone: TZ, ...o })
export const fmtTime = d => f(d, { hour: '2-digit', minute: '2-digit', hour12: false })
export const fmtDay = d => f(d, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
export const fmtFull = d => f(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
export const fmtDate = d => f(d, { day: 'numeric', month: 'short', year: 'numeric' })
export const clock = d => f(d, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
export const toLocal = d => new Date(new Date(d).getTime() + 8 * 36e5).toISOString().slice(0, 16)
export const fromLocal = v => new Date(v + ':00+08:00').toISOString()
export const ini = n => (n || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
export const emailOf = u => `${u.trim().toLowerCase()}@courtline.app`
export const GENDERS = ['Men', 'Women']
export const LEVELS = ['Bronze', 'Lower Bronze', 'Upper Beginner', 'Beginner']
export const FORMATS = {
  bo3: { best_of: 3, target: null, label: 'Best of 3 sets' },
  bo1: { best_of: 1, target: null, label: '1 set' },
  ft5: { best_of: 1, target: 5, label: 'First to 5 games' },
  ft7: { best_of: 1, target: 7, label: 'First to 7 games' }
}
export const rule = m => m.target ? `First to ${m.target}` : m.best_of === 1 ? '1 set' : 'Best of 3'
export const tn = t => t ? (t.name || `${t.player1} x ${t.player2}`) : null
const endOf = m => new Date(m.start_at).getTime() + (m.duration || 60) * 6e4
export const clash = (a, b) => new Date(a.start_at).getTime() < endOf(b) && new Date(b.start_at).getTime() < endOf(a)
export const share = m => {
  const text = `${tn(m.t1) || 'TBD'} vs ${tn(m.t2) || 'TBD'} · ${m.court} · ${fmtTime(m.start_at)} WITA`
  navigator.share ? navigator.share({ title: 'Courtline', text, url: location.href }) : navigator.clipboard.writeText(text + ' ' + location.href)
}

// Reads team rows pasted from Excel / Google Sheets or loaded from a CSV file.
// Columns: player1, player2, team name (optional), group (optional, default A).
// Accepts comma, semicolon or tab separators, with or without a header row.
const split = (line, d) => {
  const out = []; let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c }
    else if (c === '"') q = true
    else if (c === d) { out.push(cur.trim()); cur = '' }
    else cur += c
  }
  out.push(cur.trim()); return out
}
const HEAD = {
  player1: ['player1', 'player 1', 'pemain1', 'pemain 1', 'p1'],
  player2: ['player2', 'player 2', 'pemain2', 'pemain 2', 'p2'],
  name: ['name', 'team', 'team name', 'teamname', 'nama', 'nama tim', 'tim'],
  grp: ['group', 'grup', 'grp']
}
export function parseTeams(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim())
  let delim = null, off = 0
  if (lines.length && /^sep=.$/i.test(lines[0].trim())) { delim = lines.shift().trim()[4]; off++ }
  if (!lines.length) return { rows: [], errors: [] }
  if (!delim) delim = ['\t', ';', ','].map(d => [d, lines[0].split(d).length]).sort((a, b) => b[1] - a[1])[0][0]
  const first = split(lines[0], delim).map(x => x.toLowerCase())
  const idx = { player1: 0, player2: 1, name: 2, grp: 3 }
  if (first.some(x => Object.values(HEAD).flat().includes(x))) {
    Object.keys(HEAD).forEach(k => { idx[k] = first.findIndex(x => HEAD[k].includes(x)) })
    lines.shift(); off++
  }
  const rows = [], errors = []
  lines.forEach((line, i) => {
    const c = split(line, delim), cell = k => (idx[k] >= 0 ? c[idx[k]] || '' : '').trim()
    const p1 = cell('player1'), p2 = cell('player2'), n = i + off + 1
    if (!p1 || !p2) return errors.push(`Row ${n}: both player names are required`)
    const gm = /^(?:GROUP|GRUP)?\s*([A-Z])$/.exec((cell('grp') || 'A').toUpperCase())
    if (!gm) return errors.push(`Row ${n}: group must be a single letter (A, B, C…)`)
    rows.push({ player1: p1, player2: p2, name: cell('name') || `${p1} x ${p2}`, grp: gm[1] })
  })
  return { rows, errors }
}
