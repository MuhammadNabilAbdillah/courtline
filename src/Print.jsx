import { table } from './standings'
import { tn, fmtDay, fmtTime, fmtFull, clock, rd, tzLabel, scoreText } from './util'
import { t } from './i18n'

// Print-ready sheets. "Print / Save as PDF" opens the browser print dialog; choose "Save as PDF" there to get a PDF file.
export default function PrintSheet({ kind, tours, teams, matches, tid, site, onClose }) {
  const ts = tid === 'all' ? tours : tours.filter(x => x.id === tid)
  const now = new Date()
  const name = m => tn(m.t1) || m.slot1 || 'TBD'
  const name2 = m => tn(m.t2) || m.slot2 || 'TBD'
  return <div className="pwrap">
    <div className="pbar">
      <button className="btn" onClick={() => window.print()}>{t('Print / Save as PDF')}</button>
      <button className="btn o" onClick={onClose}>{t('Close')}</button>
      <span className="muted">{t('Tip: choose "Save as PDF" as the printer to get a PDF file.')}</span>
    </div>
    <div className="psheet">
      <header>
        <h1>{site.name || 'Courtline'}</h1>
        <h2>{kind === 'schedule' ? t('Match schedule') : t('Standings & results')}</h2>
        <p>{t('Printed')} {fmtFull(now)} · {clock(now)} · {t('All times in {0}', tzLabel())}</p>
      </header>
      {ts.length === 0 && <p>{t('No tournaments yet.')}</p>}
      {ts.map(tour => {
        const tm = teams.filter(x => x.tournament_id === tour.id), ms = matches.filter(x => x.tournament_id === tour.id)
        const groups = [...new Set(tm.map(x => x.grp))].sort()
        if (kind === 'schedule') {
          const days = [...new Set(ms.map(m => fmtDay(m.start_at)))]
          return <section key={tour.id}>
            <h3>{tour.name} <small>{tour.gender} · {tour.level}</small></h3>
            {days.map(d => <div key={d}><h4>{d}</h4>
              <table><thead><tr><th>{t('Time')}</th><th>{t('Court')}</th><th>{t('Team A')}</th><th>{t('Team B')}</th><th>{t('Round')}</th><th>{t('Score')}</th></tr></thead>
                <tbody>{ms.filter(m => fmtDay(m.start_at) === d).map(m => <tr key={m.id}><td>{fmtTime(m.start_at)}</td><td>{m.court}</td><td><b>{name(m)}</b></td><td><b>{name2(m)}</b></td><td>{rd(m.round)}</td><td className="sc">{scoreText(m)}</td></tr>)}</tbody></table></div>)}
            {!ms.length && <p>{t('No scheduled matches.')}</p>}
          </section>
        }
        const done = ms.filter(m => m.status === 'finished')
        return <section key={tour.id}>
          <h3>{tour.name} <small>{tour.gender} · {tour.level}</small></h3>
          {groups.map(g => <div key={g}><h4>{t('Group')} {g}</h4>
            <table><thead><tr><th>#</th><th>{t('TEAM')}</th><th>{t('Players')}</th><th>G</th><th>W</th><th>L</th><th>{t('DIFF')}</th><th>{t('Pts')}</th></tr></thead>
              <tbody>{table(tm.filter(x => x.grp === g), ms).map((r, i) => <tr key={r.t.id}><td>{i + 1}</td><td><b>{tn(r.t)}</b></td><td>{r.t.player1} / {r.t.player2}</td><td>{r.g}</td><td>{r.w}</td><td>{r.l}</td><td>{r.diff}</td><td><b>{r.pts}</b></td></tr>)}</tbody></table></div>)}
          <h4>{t('Results')}</h4>
          {done.length ? <table><thead><tr><th>{t('Round')}</th><th>{t('Match')}</th><th>{t('Score')}</th><th>{t('Winner')}</th></tr></thead>
            <tbody>{done.map(m => <tr key={m.id}><td>{rd(m.round)}</td><td>{name(m)} – {name2(m)}</td><td className="sc">{scoreText(m)}</td><td><b>{tn(m.winner === m.team1 ? m.t1 : m.t2)}</b></td></tr>)}</tbody></table>
            : <p>{t('No finished matches yet.')}</p>}
        </section>
      })}
    </div>
  </div>
}
