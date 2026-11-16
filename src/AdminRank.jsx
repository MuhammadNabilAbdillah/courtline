import { useState } from 'react'
import { table, rankKey } from './standings'
import { tn, genderLabel } from './util'

// One group: shows the order produced by the rules and lets an admin set the order by hand
function GroupRank({ tour, g, tm, ms, settings, save }) {
  const key = rankKey(tour.id, g), rows = table(tm, ms), [edit, setEdit] = useState(null)
  const name = id => tn(tm.find(x => x.id === id))
  const move = (i, d) => { const a = [...edit], j = i + d; if (j < 0 || j >= a.length) return; const x = a[i]; a[i] = a[j]; a[j] = x; setEdit(a) }
  const commit = async () => {
    const ok = await save({ rankOverrides: { ...(settings.rankOverrides || {}), [key]: edit } }, 'Set manual group ranking', `${tour.name} · Group ${g}: ${edit.map(name).join(' > ')}`)
    if (ok) setEdit(null)
  }
  const clear = async () => {
    if (!confirm('Go back to the automatic order for this group?')) return
    const o = { ...(settings.rankOverrides || {}) }; delete o[key]
    await save({ rankOverrides: o }, 'Cleared manual group ranking', `${tour.name} · Group ${g}`)
  }
  return <div className="gt">
    <div className="ph"><h3>Group {g}</h3>
      {rows.manual && <span className="chip">Manual order</span>}
      {!rows.manual && rows.unresolved && <span className="chip lock">Tie needs a decision</span>}
      {!rows.manual && !rows.unresolved && rows.complete && <span className="chip">Final</span>}
    </div>
    {edit ? <>
      <div className="items">{edit.map((id, i) => <div className="item rs" key={id}>
        <div className="im"><b>{i + 1}. {name(id)}</b></div>
        <div className="ia"><button className="btn o sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">▲</button><button className="btn o sm" disabled={i === edit.length - 1} onClick={() => move(i, 1)} aria-label="Move down">▼</button></div>
      </div>)}</div>
      <div className="ctrl"><button className="btn sm" onClick={commit}>Save order</button><button className="btn o sm" onClick={() => setEdit(null)}>Cancel</button></div>
    </> : <>
      <div className="scroll"><table className="tb"><thead><tr><th>TEAM</th><th>G</th><th>W-L</th><th>H2H</th><th>DIFF</th><th>+M</th><th>P</th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={r.t.id}><td>{i + 1}. {tn(r.t)}{!rows.manual && r.unresolved && rows.complete && ' ⚠'}</td><td>{r.g}</td><td>{r.w}-{r.l}</td><td>{r.hw}/{r.hd}</td><td>{r.diff}</td><td>{r.gw}</td><td>{r.pts}</td></tr>)}</tbody></table></div>
      <div className="ctrl"><button className="btn o sm" onClick={() => setEdit(rows.map(r => r.t.id))}>Set order manually</button>{rows.manual && <button className="btn o sm danger" onClick={clear}>Use automatic order</button>}</div>
    </>}
  </div>
}

export function StandingsPanel({ tours, teams, matches, settings, save }) {
  return <div className="panel"><h3>Group standings & tie-break</h3>
    <p className="muted">Order: most wins, then the head-to-head result between the tied teams (H2H = wins / point difference), then overall point difference, then points scored. If teams are still level after a finished group, a ⚠ appears and you can set the order by hand; the bracket and every standings table follow your order.</p>
    {tours.map(tr => {
      const tm = teams.filter(x => x.tournament_id === tr.id), ms = matches.filter(x => x.tournament_id === tr.id)
      const groups = [...new Set(tm.map(x => x.grp))].sort()
      if (!groups.length) return null
      return <div key={tr.id}><h4 className="sub-h">{tr.name} <small>{genderLabel(tr.gender)} · {tr.level}</small></h4>
        <div className="gg">{groups.map(g => <GroupRank key={g} tour={tr} g={g} tm={tm.filter(x => x.grp === g)} ms={ms} settings={settings} save={save} />)}</div></div>
    })}
    {!tours.length && <p className="muted">No tournaments yet.</p>}
  </div>
}
