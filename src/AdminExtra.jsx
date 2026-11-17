import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { FORMATS, fmtOptions, TZS, courtList, fmtDate, fmtTime, tzLabel, tn, DEFAULTS, slotText } from './util'
import { exportXlsx } from './export'

// Log perubahan: dicatat oleh setiap aksi penting panitia (server mengisi siapa pelakunya)
export const log = (action, detail = '') => supabase.from('audit_log').insert({ action, detail }).then(() => {}, () => {})
export const mname = m => `${tn(m.t1) || slotText(m.slot1) || 'Belum ada'} vs ${tn(m.t2) || slotText(m.slot2) || 'Belum ada'}`
const download = (obj, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })); a.download = name; a.click() }

export function CourtSelect({ value, onChange, courts }) {
  const list = [...new Set([...courts, value].filter(Boolean))]
  return <select value={value} onChange={e => onChange(e.target.value)} aria-label="Lapangan">{list.map(c => <option key={c} value={c}>{c}</option>)}</select>
}

export function WalkoverBox({ m, onSave, onCancel }) {
  const [w, setW] = useState('')
  return <div className="editbox">
    <h4>Walkover (lawan tidak hadir)</h4>
    <p className="muted">Pilih tim yang <b>hadir</b>. Tim itu menang dan hasilnya dicatat dengan skor walkover standar.</p>
    <div className="fm"><select value={w} onChange={e => setW(e.target.value)}><option value="">Tim pemenang…</option><option value="0">{tn(m.t1)}</option><option value="1">{tn(m.t2)}</option></select></div>
    <div className="ctrl"><button className="btn sm" disabled={w === ''} onClick={() => onSave(+w)}>Catat walkover</button><button className="btn o sm" onClick={onCancel}>Batal</button></div>
  </div>
}

export function NoteBox({ m, onSave, onCancel }) {
  const [r, setR] = useState(m.referee || ''), [n, setN] = useState(m.notes || '')
  return <div className="editbox">
    <h4>Wasit & catatan</h4>
    <div className="fm">
      <input placeholder="Nama wasit" maxLength={60} value={r} onChange={e => setR(e.target.value)} />
      <input className="wide" placeholder="Catatan yang tampil di pertandingan, mis. Jeda 10 menit karena hujan" maxLength={200} value={n} onChange={e => setN(e.target.value)} />
    </div>
    <div className="ctrl"><button className="btn sm" onClick={() => onSave({ referee: r.trim() || null, notes: n.trim() || null })}>Simpan</button><button className="btn o sm" onClick={onCancel}>Batal</button></div>
  </div>
}

// Atur ulang jadwal cepat: tukar urutan, geser 15 menit, atau ganti lapangan.
export function Reorder({ ms, courts, edit, swap }) {
  const [open, setOpen] = useState(false)
  const list = ms.filter(m => m.status === 'scheduled').sort((a, b) => new Date(a.start_at) - new Date(b.start_at))
  const shift = (m, min) => edit(m, { start_at: new Date(+new Date(m.start_at) + min * 6e4).toISOString() }, 'Menggeser pertandingan')
  return <div className="panel">
    <div className="ph"><h3>Atur urutan jadwal</h3><button className="btn o sm" onClick={() => setOpen(!open)}>{open ? 'Tutup' : `Buka (${list.length})`}</button></div>
    {open && <>
      <p className="muted">▲ ▼ menukar jam dan lapangan dengan pertandingan di atas/bawahnya. −15 / +15 menggeser satu pertandingan. Kamu akan diberi peringatan jika lapangan atau tim jadi bentrok.</p>
      <div className="items">{list.map((m, i) => <div className="item rs" key={m.id}>
        <div className="im"><b>{fmtTime(m.start_at)} · {mname(m)}</b><small>{fmtDate(m.start_at)} · {m.round === 'Group Stage' ? 'Babak Grup' : m.round}</small></div>
        <div className="ia">
          <button className="btn o sm" disabled={i === 0} aria-label="Tukar dengan pertandingan di atas" onClick={() => swap(list[i - 1], m)}>▲</button>
          <button className="btn o sm" disabled={i === list.length - 1} aria-label="Tukar dengan pertandingan di bawah" onClick={() => swap(m, list[i + 1])}>▼</button>
          <button className="btn o sm" onClick={() => shift(m, -15)}>−15</button>
          <button className="btn o sm" onClick={() => shift(m, 15)}>+15</button>
          <CourtSelect value={m.court} courts={courts} onChange={c => c !== m.court && edit(m, { court: c }, 'Mengganti lapangan')} />
        </div></div>)}</div>
      {!list.length && <p className="muted">Tidak ada pertandingan yang akan datang untuk diatur.</p>}
    </>}
  </div>
}

export function ExportPanel({ tours, teams, matches, at, onPrint }) {
  const [sel, setSel] = useState(at || 'all')
  return <div className="panel"><h3>Unduh & cetak</h3>
    <p className="muted">File Excel berisi tiga sheet: klasemen, semua pertandingan (skor, walkover, wasit, catatan), dan daftar tim. Untuk PDF, pilih <b>Simpan sebagai PDF</b> di jendela cetak.</p>
    <div className="fm"><select value={sel} onChange={e => setSel(e.target.value)}><option value="all">Semua kategori</option>{tours.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
    <div className="ctrl">
      <button className="btn" onClick={() => exportXlsx({ tours, teams, matches, tid: sel })}>Unduh Excel (.xlsx)</button>
      <button className="btn o" onClick={() => onPrint('report', sel)}>Klasemen & hasil (PDF)</button>
      <button className="btn o" onClick={() => onPrint('schedule', sel)}>Cetak jadwal</button>
    </div>
  </div>
}

export function HistoryPanel() {
  const [rows, setRows] = useState(null), [q, setQ] = useState(''), [err, setErr] = useState('')
  const load = () => supabase.from('audit_log').select('*').order('at', { ascending: false }).limit(400).then(r => { if (r.error) setErr(r.error.message); else { setErr(''); setRows(r.data) } })
  useEffect(() => { load() }, [])
  const list = (rows || []).filter(r => `${r.actor} ${r.action} ${r.detail || ''}`.toLowerCase().includes(q.toLowerCase()))
  return <div className="panel"><div className="ph"><h3>Log perubahan</h3><button className="btn o sm" onClick={load}>Muat ulang</button></div>
    <p className="muted">Siapa yang mengubah skor, jadwal, tim, atau pengaturan, dan kapan. Poin satuan tidak dicatat di sini; buka halaman pertandingan untuk melihat riwayat poin.</p>
    <div className="fm"><input className="wide" placeholder="Cari nama, aksi, atau pertandingan…" value={q} onChange={e => setQ(e.target.value)} /></div>
    {err && <p className="err">{err}{/relation|schema cache/i.test(err) ? ' — jalankan supabase.sql terbaru dulu.' : ''}</p>}
    {rows && <div className="scroll"><table className="tb left hist"><thead><tr><th>Kapan</th><th>Siapa</th><th>Apa</th></tr></thead>
      <tbody>{list.map(r => <tr key={r.id}><td className="nw">{fmtDate(r.at)} {fmtTime(r.at)}</td><td><b>{r.actor || '–'}</b></td><td><b>{r.action}</b>{r.detail ? <><br /><small>{r.detail}</small></> : null}</td></tr>)}</tbody></table></div>}
    {rows && !list.length && <p className="muted">Belum ada catatan.</p>}
  </div>
}

// Memperkecil logo menjadi PNG kecil supaya cukup disimpan di baris pengaturan
const readLogo = file => new Promise((res, rej) => {
  const img = new Image(), url = URL.createObjectURL(file)
  img.onload = () => {
    const k = Math.min(1, 160 / Math.max(img.width, img.height, 1)), c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k))
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/png'))
  }
  img.onerror = () => rej(new Error('Gambar tidak bisa dibaca'))
  img.src = url
})

export function SiteSettings({ settings, save }) {
  const [f, setF] = useState({ name: settings.name || '', venue: settings.venue || '', dates: settings.dates || '', color: settings.color || DEFAULTS.color, logo: settings.logo || '' })
  const pick = async e => { const file = e.target.files[0]; e.target.value = ''; if (!file) return; try { setF({ ...f, logo: await readLogo(file) }) } catch (x) { alert(x.message) } }
  const ok = /^#[0-9a-f]{6}$/i.test(f.color)
  return <div className="panel"><h3>Tampilan situs</h3>
    <p className="muted">Nama acara, tanggal, lokasi, logo, dan warna utama yang dilihat semua orang.</p>
    <div className="prev" style={{ background: ok ? f.color : DEFAULTS.color }}>
      {f.logo ? <img src={f.logo} alt="" /> : <span className="pl">LOGO</span>}<b>{f.name}</b>
    </div>
    <div className="fm">
      <input className="wide" maxLength={60} placeholder="Nama acara" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
      <input maxLength={60} placeholder="Tanggal, mis. 5 & 6 Desember 2026 (opsional)" value={f.dates} onChange={e => setF({ ...f, dates: e.target.value })} />
      <input maxLength={60} placeholder="Lokasi (opsional)" value={f.venue} onChange={e => setF({ ...f, venue: e.target.value })} />
      <label className="colorp">Warna utama <input type="color" value={ok ? f.color : DEFAULTS.color} onChange={e => setF({ ...f, color: e.target.value })} /></label>
      <input placeholder="#032a5f" maxLength={7} value={f.color} onChange={e => setF({ ...f, color: e.target.value })} />
      <label className="btn o">Pilih logo<input type="file" accept="image/*" hidden onChange={pick} /></label>
      {f.logo && <button className="btn o" onClick={() => setF({ ...f, logo: '' })}>Hapus logo</button>}
      <button className="btn o" onClick={() => setF({ ...f, color: DEFAULTS.color })}>Reset warna</button>
    </div>
    <div className="ctrl"><button className="btn" disabled={!ok} onClick={() => save({ name: f.name.trim(), venue: f.venue.trim(), dates: f.dates.trim(), color: f.color, logo: f.logo }, 'Mengubah tampilan situs', f.name.trim())}>Simpan tampilan situs</button></div>
  </div>
}

export function TimeSettings({ settings, save }) {
  const [tz, setTz] = useState(settings.tz), [h12, setH12] = useState(!!settings.hour12)
  return <div className="panel"><h3>Zona waktu & jam</h3>
    <p className="muted">Semua jam di situs dan konsol admin mengikuti zona ini, apa pun pengaturan HP penonton. Saat ini ditampilkan sebagai <b>{tzLabel()}</b>.</p>
    <div className="fm">
      <select value={tz} onChange={e => setTz(e.target.value)}>{TZS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <select value={h12} onChange={e => setH12(e.target.value === 'true')}><option value="false">24 jam (14:30)</option><option value="true">12 jam (2:30 pm)</option></select>
      <button className="btn" onClick={() => save({ tz, hour12: h12 }, 'Mengubah pengaturan waktu', `${tz}, ${h12 ? '12 jam' : '24 jam'}`)}>Simpan</button>
    </div>
  </div>
}

export function RuleSettings({ settings, save }) {
  const [f, setF] = useState({ fmt: settings.fmt, golden: settings.golden, duration: settings.duration, autoLock: !!settings.autoLock })
  return <div className="panel"><h3>Aturan pertandingan bawaan</h3>
    <p className="muted">Terisi otomatis saat kamu membuat jadwal atau bagan, jadi tidak perlu memilih berulang kali.</p>
    <div className="fm">
      <select value={f.fmt} onChange={e => setF({ ...f, fmt: e.target.value })}>{fmtOptions(f.fmt).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      {FORMATS[f.fmt].scoring !== 'race' && <select value={f.golden} onChange={e => setF({ ...f, golden: e.target.value === 'true' })}><option value="true">Golden point</option><option value="false">Advantage</option></select>}
      <select value={[15, 20, 25, 30, 40, 45, 60, 75, 90, 120].includes(f.duration) ? f.duration : 30} onChange={e => setF({ ...f, duration: +e.target.value })}>{[15, 20, 25, 30, 40, 45, 60, 75, 90, 120].map(x => <option key={x} value={x}>{x} menit</option>)}</select>
      <label className="chk full"><input type="checkbox" checked={f.autoLock} onChange={e => setF({ ...f, autoLock: e.target.checked })} /> Kunci pertandingan otomatis saat selesai (admin bisa membuka kunci)</label>
    </div>
    <div className="ctrl"><button className="btn" onClick={() => save(f, 'Mengubah aturan bawaan', `${f.fmt}, ${f.golden ? 'golden point' : 'advantage'}, ${f.duration} menit${f.autoLock ? ', kunci otomatis' : ''}`)}>Simpan aturan bawaan</button></div>
  </div>
}

export function CourtsPanel({ settings, save }) {
  const cur = courtList(settings), [nn, setNn] = useState(''), [ed, setEd] = useState({})
  const dup = (n, skip) => cur.some((c, k) => k !== skip && c.name.toLowerCase() === n.toLowerCase())
  const add = e => {
    e.preventDefault(); const n = nn.trim()
    if (!n) return
    if (dup(n, -1)) return alert('Lapangan itu sudah ada')
    save({ courts: [...cur, { name: n, active: true }] }, 'Menambah lapangan', n).then(ok => ok && setNn(''))
  }
  const toggle = i => {
    if (cur[i].active && cur.filter(c => c.active).length === 1) return alert('Sisakan minimal satu lapangan aktif')
    save({ courts: cur.map((c, k) => k === i ? { ...c, active: !c.active } : c) }, cur[i].active ? 'Menonaktifkan lapangan' : 'Mengaktifkan lapangan', cur[i].name)
  }
  const rename = async i => {
    const n = (ed[i] ?? '').trim(), old = cur[i].name
    if (!n || n === old) return
    if (dup(n, i)) return alert('Nama itu sudah dipakai')
    const r = await supabase.from('matches').update({ court: n }).eq('court', old)
    if (r.error) return alert(r.error.message)
    if (await save({ courts: cur.map((c, k) => k === i ? { ...c, name: n } : c) }, 'Mengganti nama lapangan', `${old} → ${n}`)) setEd({ ...ed, [i]: undefined })
  }
  return <div className="panel"><h3>Lapangan</h3>
    <p className="muted">Lapangan yang bisa dipilih saat membuat jadwal. Mengganti nama juga memperbarui lapangan di pertandingan yang sudah ada. Lapangan nonaktif hilang dari pilihan, tetapi pertandingan lama tetap memakai namanya.</p>
    <form className="fm" onSubmit={add}><input placeholder="Nama lapangan baru, mis. Center Court" maxLength={40} value={nn} onChange={e => setNn(e.target.value)} /><button className="btn">Tambah lapangan</button></form>
    <div className="items">{cur.map((c, i) => <div className="item rs" key={i}>
      <div className="im"><input value={ed[i] ?? c.name} maxLength={40} onChange={e => setEd({ ...ed, [i]: e.target.value })} aria-label="Nama lapangan" /></div>
      {!c.active && <span className="chip">Nonaktif</span>}
      <div className="ia">
        {(ed[i] ?? c.name).trim() !== c.name && <button className="btn sm" onClick={() => rename(i)}>Simpan nama</button>}
        <button className="btn o sm" onClick={() => toggle(i)}>{c.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
      </div></div>)}</div>
  </div>
}

// Memulihkan data dari cadangan. Pertandingan terkunci dibuka dulu (hanya yang ada di cadangan) agar bisa ditimpa.
export async function restoreData(d) {
  if (!d || d.app !== 'courtline') throw new Error('Ini bukan file cadangan Courtline')
  const ids = (d.matches || []).map(m => m.id)
  for (let i = 0; i < ids.length; i += 40) await supabase.from('matches').update({ locked: false }).in('id', ids.slice(i, i + 40)).eq('locked', true)
  for (const [tb, rows] of [['tournaments', d.tournaments], ['teams', d.teams], ['matches', d.matches], ['announcements', d.announcements], ['settings', d.settings]]) {
    if (!rows || !rows.length) continue
    const r = await supabase.from(tb).upsert(rows); if (r.error) throw r.error
  }
}

// Kosongkan semua tim & pertandingan (semua kategori) untuk membersihkan data uji coba sebelum acara sungguhan.
// Cadangan dibuat dulu supaya bisa dipulihkan. Kategori dan pengaturan tidak ikut terhapus.
function WipePanel({ load, snap }) {
  const [busy, setBusy] = useState(false)
  const go = async () => {
    if (prompt('Ini menghapus SEMUA tim dan SEMUA pertandingan di semua kategori (kategori & pengaturan tetap ada).\nCadangan dibuat otomatis lebih dulu.\n\nKetik HAPUS untuk melanjutkan:') !== 'HAPUS') return
    setBusy(true)
    try {
      const b = await supabase.rpc('make_backup', { k: 'manual' })
      if (b.error) download(await snap(), `courtline-sebelum-hapus-${new Date().toISOString().slice(0, 10)}.json`)
      const nil = '00000000-0000-0000-0000-000000000000'
      const m = await supabase.from('matches').delete().neq('id', nil); if (m.error) throw m.error
      const t = await supabase.from('teams').delete().neq('id', nil); if (t.error) throw t.error
      log('Mengosongkan semua tim dan pertandingan'); alert('Selesai. Semua tim dan pertandingan sudah dihapus.')
    } catch (x) { alert(x.message) }
    setBusy(false); load()
  }
  return <div className="wipe"><h3>Kosongkan data uji coba</h3>
    <p className="muted">Menghapus semua tim dan pertandingan di <b>semua kategori</b> sekaligus, cocok setelah mencoba aplikasi dan sebelum acara sungguhan. Kategori, akun, dan pengaturan tetap ada. Sebuah cadangan dibuat otomatis sebelum menghapus.</p>
    <div className="ctrl"><button className="btn o danger" disabled={busy} onClick={go}>{busy ? 'Menghapus…' : 'Hapus semua tim & pertandingan'}</button></div></div>
}

export function BackupPanel({ load }) {
  const [list, setList] = useState(null), [busy, setBusy] = useState(false)
  const refresh = () => supabase.from('backups').select('id,created_at,kind').order('created_at', { ascending: false }).limit(60).then(r => setList(r.error ? false : r.data))
  useEffect(() => { refresh() }, [])
  const snap = async () => {
    const T = ['tournaments', 'teams', 'matches', 'announcements', 'settings'], r = await Promise.all(T.map(x => supabase.from(x).select('*')))
    const o = { app: 'courtline', exported_at: new Date().toISOString() }; T.forEach((x, i) => { o[x] = r[i].data || [] }); return o
  }
  const getData = async id => { const r = await supabase.from('backups').select('data').eq('id', id).single(); if (r.error) throw r.error; return r.data.data }
  const restoreFile = async e => {
    const file = e.target.files[0]; e.target.value = ''
    if (!file || !confirm('Pulihkan cadangan ini? Data dengan ID yang sama akan ditimpa.')) return
    try { await restoreData(JSON.parse(await file.text())); log('Memulihkan cadangan', file.name); alert('Cadangan dipulihkan'); load() } catch (x) { alert(x.message) }
  }
  const now = async () => {
    setBusy(true); const r = await supabase.rpc('make_backup', { k: 'manual' }); setBusy(false)
    if (r.error) return alert(r.error.message + (/function|schema cache/i.test(r.error.message) ? '\nJalankan supabase.sql terbaru dulu.' : ''))
    refresh()
  }
  return <div className="panel"><h3>Cadangan data</h3>
    <p className="muted">Salinan semua data (kategori, tim, pertandingan, pengumuman, pengaturan) disimpan otomatis tiap 6 jam, dan saat admin membuka konsol jika salinan terakhir lebih lama dari itu. 60 salinan terbaru disimpan.</p>
    <div className="fm">
      <button className="btn" onClick={async () => { download(await snap(), `courtline-backup-${new Date().toISOString().slice(0, 10)}.json`); log('Mengunduh cadangan') }}>Unduh file cadangan</button>
      <label className="btn o">Pulihkan dari file<input type="file" accept="application/json" hidden onChange={restoreFile} /></label>
      <button className="btn o" disabled={busy} onClick={now}>{busy ? 'Menyimpan…' : 'Cadangkan sekarang'}</button>
    </div>
    {list === false && <p className="muted">Cadangan otomatis membutuhkan supabase.sql terbaru (membuat tabel backups).</p>}
    {list && <div className="scroll"><table className="tb left"><tbody>{list.map(b => <tr key={b.id}>
      <td className="nw">{fmtDate(b.created_at)} {fmtTime(b.created_at)}</td><td>{b.kind === 'auto' ? 'Otomatis' : 'Manual'}</td>
      <td className="ra"><button className="btn o sm" onClick={async () => { try { download(await getData(b.id), `courtline-backup-${b.id}.json`) } catch (x) { alert(x.message) } }}>Unduh</button>{' '}
        <button className="btn o sm" onClick={async () => { if (!confirm('Pulihkan cadangan ini? Data dengan ID yang sama akan ditimpa.')) return; try { await restoreData(await getData(b.id)); log('Memulihkan cadangan', `${fmtDate(b.created_at)} ${fmtTime(b.created_at)}`); alert('Cadangan dipulihkan'); load() } catch (x) { alert(x.message) } }}>Pulihkan</button></td></tr>)}</tbody></table></div>}
    {list && !list.length && <p className="muted">Belum ada cadangan otomatis.</p>}
    <WipePanel load={load} snap={snap} />
  </div>
}
