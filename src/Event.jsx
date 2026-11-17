import { useState } from 'react'
import { fmtDay, fmtTime, fromLocal, rule, FORMATS } from './util'
import { WIN_PTS as WIN } from './standings'
import { t } from './i18n'

const digits = s => String(s || '').replace(/\D/g, '')
const wa = s => { let d = digits(s); if (d.startsWith('0')) d = '62' + d.slice(1); return d ? 'https://wa.me/' + d : '' }

// Event info page for visitors: venue + map, programme, rules, organiser contacts
export function InfoPage({ site, matches, onTv }) {
  const ev = site.event || {}, venue = site.venue || ''
  const q = encodeURIComponent(`${venue} Bontang`.trim())
  const mapUrl = ev.mapUrl || `https://www.google.com/maps/search/?api=1&query=${q}`
  const days = [...new Set([...matches].sort((a, b) => new Date(a.start_at) - new Date(b.start_at)).map(m => fmtDay(m.start_at)))].map(d => {
    const dm = matches.filter(m => fmtDay(m.start_at) === d).sort((a, b) => new Date(a.start_at) - new Date(b.start_at))
    return { d, n: dm.length, from: fmtTime(dm[0].start_at), to: fmtTime(dm[dm.length - 1].start_at) }
  })
  const rules = [...new Set(matches.map(rule))]
  const auto = [
    `${t('Match format')}: ${rules.length ? rules.join(', ') : (FORMATS[site.fmt] || FORMATS.race6).label}.`,
    t('Group stage: a win is worth {0} points.', WIN),
    t('If teams are level: most wins, then head-to-head result, then point difference, then points scored. The organisers decide any tie that remains.')
  ]
  const custom = String(ev.rules || '').split('\n').map(x => x.trim()).filter(Boolean)
  const prog = [...(ev.program || [])].filter(p => p.date && p.title).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
  const pdays = [...new Set(prog.map(p => p.date))]
  const contacts = (ev.contacts || []).filter(c => c.name || c.phone)
  return <>
    <section className="banner info">
      <div>
        <small>{t('EVENT INFO')}</small>
        <h1>{site.name}</h1>
        <div className="tmeta">{site.dates && <span>{site.dates}</span>}{venue && <span>{venue}</span>}</div>
      </div>
    </section>

    <h3 className="sec">{t('Venue')}</h3>
    <div className="panel venue">
      <h3>{venue || t('Venue')}</h3>
      {ev.address && <p>{ev.address}</p>}
      <iframe className="map" title="Map" loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={`https://maps.google.com/maps?q=${q}&output=embed`} />
      <div className="ctrl"><a className="btn sm" href={mapUrl} target="_blank" rel="noreferrer">{t('Open in Google Maps')}</a></div>
    </div>

    {(pdays.length > 0 || days.length > 0) && <><h3 className="sec">{t('Schedule of the event')}</h3>
      <div className="panel">
        {pdays.map(d => <div key={d}><div className="day">{fmtDay(fromLocal(d + 'T00:00'))}</div>
          <ul className="prog2">{prog.filter(p => p.date === d).map((p, i) => <li key={i}><b>{p.time || ''}</b><span>{p.title}</span></li>)}</ul></div>)}
        {days.length > 0 && <><div className="day">{t('Match days')}</div>
          <ul className="prog2">{days.map(x => <li key={x.d}><b>{x.from}–{x.to}</b><span>{x.d} · {x.n} {t('matches')}</span></li>)}</ul></>}
      </div></>}

    <h3 className="sec">{t('Rules')}</h3>
    <div className="panel"><ul className="rules">{[...auto, ...custom].map((r, i) => <li key={i}>{r}</li>)}</ul></div>

    {contacts.length > 0 && <><h3 className="sec">{t('Contact the committee')}</h3>
      <div className="grid">{contacts.map((c, i) => <div className="card" key={i}>
        <b>{c.name}</b>{c.role && <div className="muted">{c.role}</div>}
        {c.phone && <div className="ctrl"><a className="btn sm" href={'tel:' + digits(c.phone)}>{t('Call')}</a>{wa(c.phone) && <a className="btn o sm" href={wa(c.phone)} target="_blank" rel="noreferrer">WhatsApp</a>}</div>}
      </div>)}</div></>}

    <div className="ctrl"><button className="btn o" onClick={onTv}>{t('Open TV mode')}</button></div>
  </>
}

// Admin: atur isi halaman Info
export function EventSettings({ settings, save }) {
  const ev = settings.event || {}
  const [f, setF] = useState({ address: ev.address || '', mapUrl: ev.mapUrl || '', rules: ev.rules || '', contacts: ev.contacts || [], program: ev.program || [] })
  const upd = (k, i, p) => setF({ ...f, [k]: f[k].map((x, j) => (j === i ? { ...x, ...p } : x)) })
  const del = (k, i) => setF({ ...f, [k]: f[k].filter((_, j) => j !== i) })
  return <div className="panel"><h3>Halaman info acara</h3>
    <p className="muted">Tampil di tab Info untuk penonton. Nama lokasi diambil dari Tampilan Situs di atas. Format pertandingan dan aturan seri ditambahkan otomatis.</p>
    <div className="fm">
      <input className="wide" placeholder="Alamat lokasi (opsional)" value={f.address} onChange={e => setF({ ...f, address: e.target.value })} />
      <input className="wide" placeholder="Link Google Maps (opsional, jika kosong dicari lewat nama lokasi)" value={f.mapUrl} onChange={e => setF({ ...f, mapUrl: e.target.value })} />
    </div>
    <label className="fl">Aturan tambahan (satu per baris)<textarea className="ta" rows={5} value={f.rules} onChange={e => setF({ ...f, rules: e.target.value })} placeholder={'mis. Tim wajib lapor 15 menit sebelum pertandingan.\nWajib memakai sepatu khusus lapangan padel.'} /></label>
    <h4 className="sub-h">Rangkaian acara</h4>
    {f.program.map((p, i) => <div className="fm" key={i}>
      <input type="date" value={p.date || ''} onChange={e => upd('program', i, { date: e.target.value })} />
      <input type="time" value={p.time || ''} onChange={e => upd('program', i, { time: e.target.value })} />
      <input className="wide" placeholder="mis. Upacara pembukaan" value={p.title || ''} onChange={e => upd('program', i, { title: e.target.value })} />
      <button className="btn o sm danger" onClick={() => del('program', i)}>Hapus</button></div>)}
    <div className="ctrl"><button className="btn o sm" onClick={() => setF({ ...f, program: [...f.program, { date: (f.program[f.program.length - 1] || {}).date || '', time: '', title: '' }] })}>+ Tambah acara</button></div>
    <h4 className="sub-h">Kontak panitia</h4>
    {f.contacts.map((c, i) => <div className="fm" key={i}>
      <input placeholder="Nama" value={c.name || ''} onChange={e => upd('contacts', i, { name: e.target.value })} />
      <input placeholder="Jabatan, mis. Ketua pelaksana" value={c.role || ''} onChange={e => upd('contacts', i, { role: e.target.value })} />
      <input placeholder="Telepon / WhatsApp, mis. 0812…" inputMode="tel" value={c.phone || ''} onChange={e => upd('contacts', i, { phone: e.target.value })} />
      <button className="btn o sm danger" onClick={() => del('contacts', i)}>Hapus</button></div>)}
    <div className="ctrl"><button className="btn o sm" onClick={() => setF({ ...f, contacts: [...f.contacts, { name: '', role: '', phone: '' }] })}>+ Tambah kontak</button></div>
    <div className="ctrl"><button className="btn" onClick={() => save({ event: { address: f.address.trim(), mapUrl: f.mapUrl.trim(), rules: f.rules.trim(), contacts: f.contacts.filter(c => (c.name || '').trim() || (c.phone || '').trim()), program: f.program.filter(p => p.date && (p.title || '').trim()) } }, 'Mengubah halaman info acara')}>Simpan info acara</button></div>
  </div>
}
