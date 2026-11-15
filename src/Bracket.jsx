import { useRef, useState } from 'react'
import { tn, rule, fmtTime } from './util'

const NAVY = '#032a5f', LINE = '#c9d5e8', MUTE = '#66779a', FF = "Sora, 'Segoe UI', Arial, sans-serif"
export const ORDER = ['Round of 16', 'Quarterfinal', 'Semifinal', 'Final']
const score = (m, i) => m.status === 'scheduled' ? '' : [...m.sets.map(s => s[i]), ...(m.status === 'live' ? [m.g[i]] : [])].join(' ')
const cut = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s

// Projected knockout bracket (not saved) for 1 or 2 groups, shown before the real one is generated
export function virtualKO(teams) {
  const gs = [...new Set(teams.map(t => t.grp))].sort()
  const mk = (code, round, s1, s2) => ({ id: 'v-' + code, code, round, slot1: s1, slot2: s2, t1: null, t2: null, sets: [], g: [0, 0], p: [0, 0], status: 'scheduled', best_of: 3, target: null, virtual: true })
  const F = mk('F', 'Final', 'Winner SF1', 'Winner SF2')
  if (gs.length === 2) return [mk('SF1', 'Semifinal', `1st Group ${gs[0]}`, `2nd Group ${gs[1]}`), mk('SF2', 'Semifinal', `1st Group ${gs[1]}`, `2nd Group ${gs[0]}`), F]
  if (gs.length === 1) return [mk('SF1', 'Semifinal', `1st Group ${gs[0]}`, `4th Group ${gs[0]}`), mk('SF2', 'Semifinal', `2nd Group ${gs[0]}`, `3rd Group ${gs[0]}`), F]
  return []
}

function download(svg, W, H, name) {
  const s = svg.cloneNode(true)
  s.setAttribute('width', W); s.setAttribute('height', H); s.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  bg.setAttribute('width', W); bg.setAttribute('height', H); bg.setAttribute('fill', '#ffffff'); s.insertBefore(bg, s.firstChild)
  const img = new Image()
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
    const a = document.createElement('a'); a.download = name + '.png'; a.href = c.toDataURL('image/png'); a.click()
  }
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(s))
}

// Bracket drawn as an SVG picture (zoomable, downloadable as PNG, tap a match to edit when onPick is given)
export function BracketView({ matches, onPick, title = 'Bracket', virtual }) {
  const [z, setZ] = useState(() => window.innerWidth < 640 ? .7 : 1), ref = useRef()
  const ko = matches.filter(m => m.round !== 'Group Stage' && m.round !== 'Third Place')
  const rounds = ORDER.filter(r => ko.some(m => m.round === r))
  const third = matches.find(m => m.round === 'Third Place')
  if (!rounds.length) return <div className="empty">The knockout bracket appears here once it is created.</div>
  const cols = rounds.map(r => ko.filter(m => m.round === r).sort((a, b) => (a.code || '').localeCompare(b.code || '') || new Date(a.start_at) - new Date(b.start_at)))
  const rows = Math.max(1, cols[0].length)
  const BW = 236, BH = 68, GX = 64, RH = 104, HH = 70, P = 24
  const W = P * 2 + cols.length * BW + (cols.length - 1) * GX, body = rows * RH
  const H = HH + body + (third ? BH + 64 : 0) + P
  const cx = c => P + c * (BW + GX)
  const cy = (c, i) => { const s = rows / cols[c].length; return HH + (i * s + s / 2) * RH }

  const Box = ({ m, x, y }) => {
    const done = m.status === 'finished', live = m.status === 'live', pick = onPick && !m.virtual
    const row = (t, s, i, dy) => {
      const win = done && t && m.winner === t.id
      return <g key={i}>
        <text x={x + 14} y={y + dy + BH / 4 + 5} fontSize="13" fontFamily={FF} fontWeight={win ? 800 : 500} fontStyle={t ? 'normal' : 'italic'} fill={t ? NAVY : MUTE}>{cut((t ? tn(t) : (s || 'TBD')) + (win ? '  ✓' : ''), 25)}</text>
        <text x={x + BW - 14} y={y + dy + BH / 4 + 5} fontSize="13" fontFamily={FF} fontWeight="800" fill={NAVY} textAnchor="end">{score(m, i) || '–'}</text>
      </g>
    }
    return <g onClick={() => pick && onPick(m)} style={{ cursor: pick ? 'pointer' : 'default' }}>
      <rect x={x} y={y} width={BW} height={BH} rx="10" fill="#ffffff" stroke={live ? NAVY : LINE} strokeWidth={live ? 2.5 : 1.5} />
      <line x1={x} x2={x + BW} y1={y + BH / 2} y2={y + BH / 2} stroke={LINE} />
      {row(m.t1, m.slot1, 0, 0)}{row(m.t2, m.slot2, 1, BH / 2)}
      <text x={x + 2} y={y - 8} fontSize="10" fontFamily={FF} fill={MUTE}>{m.code || ''}{m.status === 'scheduled' && !m.virtual ? ` · ${fmtTime(m.start_at)}` : ''}{live ? ' · LIVE' : ''}</text>
    </g>
  }
  const tY = HH + body + 40

  return <div className="bwrap">
    <div className="btools">
      <span className="muted">{virtual ? 'Projected from group standings' : onPick ? 'Tap a match to edit it' : ''}</span>
      <div className="bz"><button onClick={() => setZ(Math.max(.4, +(z - .1).toFixed(1)))}>−</button><span>{Math.round(z * 100)}%</span><button onClick={() => setZ(Math.min(1.6, +(z + .1).toFixed(1)))}>+</button></div>
      <button className="btn sm" onClick={() => download(ref.current, W, H, title.replace(/\W+/g, '-').toLowerCase() || 'bracket')}>Download image</button>
    </div>
    <div className="scroll bpanel">
      <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width={W * z} height={H * z} role="img">
        <text x={P} y="26" fontSize="16" fontWeight="800" fontFamily={FF} fill={NAVY}>{cut(title.toUpperCase(), 60)}</text>
        {cols.map((ms, c) => <g key={'h' + c}>
          <text x={cx(c) + BW / 2} y={HH - 18} textAnchor="middle" fontSize="13" fontWeight="800" fontFamily={FF} fill={NAVY}>{rounds[c]}</text>
          <text x={cx(c) + BW / 2} y={HH - 4} textAnchor="middle" fontSize="10" fontFamily={FF} fill={MUTE}>{rule(ms[0])}</text></g>)}
        {cols.map((ms, c) => c > 0 && cols[c - 1].length === ms.length * 2 && ms.map((_, i) => [2 * i, 2 * i + 1].map(j => {
          const x1 = cx(c - 1) + BW, x2 = cx(c), mx = (x1 + x2) / 2
          return <path key={c + '-' + i + '-' + j} d={`M${x1} ${cy(c - 1, j)}H${mx}V${cy(c, i)}H${x2}`} fill="none" stroke={LINE} strokeWidth="2" />
        })))}
        {cols.map((ms, c) => ms.map((m, i) => <Box key={m.id} m={m} x={cx(c)} y={cy(c, i) - BH / 2} />))}
        {third && <g><text x={P} y={tY - 6} fontSize="13" fontWeight="800" fontFamily={FF} fill={NAVY}>Third Place</text><Box m={third} x={P} y={tY + 8} /></g>}
      </svg>
    </div>
  </div>
}
