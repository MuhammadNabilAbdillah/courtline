import { getLang, t } from './i18n'

// ---- site configuration (set from Admin > Settings, applied at runtime) ----
export const DEFAULT_COURTS = ['Court 1', 'Court 2', 'Court 3', 'Court 4']
export const DEFAULTS = { name: 'HIPMI BONTANG PADEL CUP 2026', logo: '', color: '#032a5f', venue: 'Vamos Arena Fit', dates: '5 & 6 December 2026', event: {}, rankOverrides: {}, tz: 'Asia/Makassar', hour12: false, fmt: 'race6', golden: true, duration: 30, courts: [], autoLock: false }
export const cfg = { tz: DEFAULTS.tz, hour12: false, name: DEFAULTS.name }
export const setCfg = o => Object.assign(cfg, o)
export const TZS = [['Asia/Jakarta', 'WIB (UTC+7)'], ['Asia/Makassar', 'WITA (UTC+8)'], ['Asia/Jayapura', 'WIT (UTC+9)'], ['Asia/Singapore', 'Singapore (UTC+8)'], ['UTC', 'UTC']]
const SHORT = { 'Asia/Jakarta': 'WIB', 'Asia/Makassar': 'WITA', 'Asia/Jayapura': 'WIT' }
export const tzLabel = () => SHORT[cfg.tz] || cfg.tz.split('/').pop().replace('_', ' ')
export const courtList = s => (s && s.courts && s.courts.length ? s.courts : DEFAULT_COURTS.map(name => ({ name, active: true })))
export const activeCourts = s => courtList(s).filter(c => c.active).map(c => c.name)

// ---- date & time (always in the configured event time zone, whatever the viewer's device says) ----
const loc = () => (getLang() === 'id' ? 'id-ID' : 'en-GB')
const f = (d, o) => new Date(d).toLocaleString(loc(), { timeZone: cfg.tz, ...o })
const ft = (d, o) => new Date(d).toLocaleString('en-GB', { timeZone: cfg.tz, hour12: cfg.hour12, ...o })
export const fmtTime = d => ft(d, { hour: '2-digit', minute: '2-digit' })
export const fmtDay = d => f(d, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
export const fmtFull = d => f(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
export const fmtDate = d => f(d, { day: 'numeric', month: 'short', year: 'numeric' })
export const clock = d => ft(d, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const parts = (d, tz) => {
  const p = {}
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(d)).forEach(x => { p[x.type] = x.value })
  return p
}
const offMin = (d, tz) => { const p = parts(d, tz); return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(new Date(d).getTime() / 1000) * 1000) / 6e4 }
export const toLocal = d => { const p = parts(d, cfg.tz); return `${p.year}-${p.month}-${p.day}T${String(+p.hour % 24).padStart(2, '0')}:${p.minute}` }
export const fromLocal = v => {
  const [dd, tt] = v.split('T'), [y, mo, da] = dd.split('-').map(Number), [h, mi] = tt.split(':').map(Number)
  const wall = Date.UTC(y, mo - 1, da, h, mi)
  let u = wall - offMin(wall, cfg.tz) * 6e4
  u = wall - offMin(u, cfg.tz) * 6e4
  return new Date(u).toISOString()
}

export const ini = n => (n || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
export const emailOf = u => `${u.trim().toLowerCase()}@courtline.app`
export const GENDERS = ['Men', 'Women'] // stored values (the database only accepts these two)
export const genderLabel = g => g === 'Men' ? "Men's" : g === 'Women' ? "Women's" : g
// Tournament name + Men's/Women's (unless the name already says it, e.g. "BEGINNER MEN")
export const tourLabel = x => !x ? '' : /\b(men|women|putra|putri|pria|wanita)\b/i.test(x.name || '') ? x.name : `${x.name} · ${genderLabel(x.gender)}`
export const LEVELS = ['Bronze', 'Lower Bronze', 'Beginner']
export const levelOptions = cur => !cur || LEVELS.includes(cur) ? LEVELS : [...LEVELS, cur] // an older tournament keeps its old level in the list
export const FORMATS = {
  race6: { best_of: 1, target: 6, scoring: 'race', label: 'Race to 6 points' },
  race5: { best_of: 1, target: 5, scoring: 'race', label: 'Race to 5 points' },
  race4: { best_of: 1, target: 4, scoring: 'race', label: 'Race to 4 points' },
  // older formats: still work for matches that already use them, but are no longer offered for new matches
  bo3: { best_of: 3, target: null, scoring: 'tennis', label: 'Best of 3 sets' },
  bo1: { best_of: 1, target: null, scoring: 'tennis', label: '1 set' },
  ft5: { best_of: 1, target: 5, scoring: 'tennis', label: 'First to 5 games' },
  ft7: { best_of: 1, target: 7, scoring: 'tennis', label: 'First to 7 games' }
}
export const SELECTABLE = ['race6', 'race5', 'race4']
export const fmtOptions = cur => (!cur || SELECTABLE.includes(cur) ? SELECTABLE : [...SELECTABLE, cur]).map(k => [k, FORMATS[k].label])
export const fmtKey = m => Object.keys(FORMATS).find(k => FORMATS[k].best_of === m.best_of && FORMATS[k].target === (m.target || null) && FORMATS[k].scoring === (m.scoring || 'tennis')) || 'race6'
export const fmtRow = k => { const F = FORMATS[k] || FORMATS.race6; return { best_of: F.best_of, target: F.target, scoring: F.scoring } }
export const rule = m => m.scoring === 'race' ? t('Race to {0} points', m.target) : m.target ? t('First to {0}', m.target) : m.best_of === 1 ? t('1 set') : t('Best of 3')
export const rd = r => t(r)
export const tn = t => t ? (t.name || `${t.player1} x ${t.player2}`) : null
const endOf = m => new Date(m.start_at).getTime() + (m.duration || 60) * 6e4
export const clash = (a, b) => new Date(a.start_at).getTime() < endOf(b) && new Date(b.start_at).getTime() < endOf(a)

// ---- sharing: every match has its own link ----
export const matchUrl = m => `${location.origin}${location.pathname}#/match/${m.id}`
const shareText = m => `${tn(m.t1) || 'TBD'} vs ${tn(m.t2) || 'TBD'} · ${m.court} · ${fmtTime(m.start_at)}`
export const waLink = m => `https://wa.me/?text=${encodeURIComponent(shareText(m) + ' ' + matchUrl(m))}`
export const share = m => {
  const text = shareText(m), url = matchUrl(m)
  if (navigator.share) navigator.share({ title: cfg.name || 'Padel Live Score', text, url }).catch(() => {})
  else navigator.clipboard?.writeText(text + ' ' + url).then(() => alert(t('Link copied')))
}

// ---- favourite teams (kept on the viewer's own device) ----
export const readFavs = () => { try { return JSON.parse(localStorage.getItem('cl-favs') || '[]') } catch { return [] } }
export const writeFavs = a => { try { localStorage.setItem('cl-favs', JSON.stringify(a)) } catch { /* private mode */ } }
export const hasFav = (m, favs) => !!favs.length && [m.team1, m.team2].some(x => x && favs.includes(x))

// "6-4 3-6 5-3" style score line for lists, printouts and exports
export const scoreText = m => {
  if (m.status === 'scheduled') return ''
  const s = m.sets.map(x => x.join('-'))
  if (m.status === 'live') s.push((m.scoring === 'race' ? m.p : m.g).join('-') + '*')
  return s.join('  ') + (m.wo ? '  WO' : '')
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
