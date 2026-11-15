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
