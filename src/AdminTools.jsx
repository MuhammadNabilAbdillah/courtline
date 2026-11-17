import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { fmtOptions, fmtRow, toLocal, fromLocal, fmtDate, fmtTime, tn, clash } from './util'
import { log } from './AdminExtra'

const HH = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MM = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))
const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

// Pemilih tanggal + jam 24 jam (langkah 5 menit), memakai zona waktu acara
export function DT({ value, onChange }) {
  const l = toLocal(value), d = l.slice(0, 10), h = l.slice(11, 13), m = l.slice(14, 16)
  const set = (a, b, c) => a && onChange(fromLocal(`${a}T${b}:${c}`))
  return <div className="dt">
    <input type="date" value={d} onChange={e => set(e.target.value, h, m)} />
    <div className="tp">
      <select value={h} onChange={e => set(d, e.target.value, m)}>{HH.map(x => <option key={x}>{x}</option>)}</select><b>:</b>
      <select value={m} onChange={e => set(d, h, e.target.value)}>{[...new Set([...MM, m])].sort().map(x => <option key={x}>{x}</option>)}</select>
    </div>
  </div>
}
const TimeOfDay = ({ min, onChange, label }) => {
  const h = String(Math.floor(min / 60)).padStart(2, '0'), m = String(min % 60).padStart(2, '0')
  return <label className="fl">{label}<div className="tp">
    <select value={h} onChange={e => onChange(+e.target.value * 60 + +m)}>{HH.map(x => <option key={x}>{x}</option>)}</select><b>:</b>
    <select value={m} onChange={e => onChange(+h * 60 + +e.target.value)}>{MM.map(x => <option key={x}>{x}</option>)}</select></div></label>
}

// Skor untuk walkover: pemenang mendapat nilai penuh (6-0 6-0 pada best of 3, 6-0 pada balapan ke 6, ...)
export const woSets = (m, w) => { const n = m.target || 6, one = [w ? 0 : n, w ? n : 0]; return m.best_of === 1 || m.target ? [one] : [one, [...one]] }

// ---------- Round-robin fixtures ----------
const key = (a, b) => [a, b].sort().join('|')
const circle = ids => { // circle method: every team meets every other team once, one round at a time
  if (ids.length < 2) return []
  const arr = ids.length % 2 ? [...ids, null] : [...ids], n = arr.length, rounds = []
  for (let r = 0; r < n - 1; r++) {
    const rd = []
    for (let i = 0; i < n / 2; i++) { const a = arr[i], b = arr[n - 1 - i]; if (a && b) rd.push([a, b]) }
    rounds.push(rd); arr.splice(1, 0, arr.pop())
  }
  return rounds
}
const naive = s => { const [d, t] = s.split('T'), [y, m, dd] = d.split('-').map(Number), [h, mi] = t.split(':').map(Number); return Date.UTC(y, m - 1, dd, h, mi) }
const asLocal = ms => new Date(ms).toISOString().slice(0, 16)
const minOfDay = ms => { const d = new Date(ms); return d.getUTCHours() * 60 + d.getUTCMinutes() }
const nextDay = (ms, min) => { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, min) }

// groups: { A: [teamId, ...] }, have: Set of "idA|idB" pairs that already have a group match, courts: [names],
// start: "YYYY-MM-DDTHH:MM" (event time), len: minutes per slot, dayEnd / nextStart: minutes of the day (dayEnd null = play non-stop)
export function planFixtures({ groups, have, courts, start, len, dayEnd, nextStart }) {
  const per = Object.keys(groups).sort().map(g => circle(groups[g]).map(r => r.filter(([a, b]) => !have.has(key(a, b))).map(([a, b]) => ({ a, b, g }))))
  const pending = [], most = Math.max(0, ...per.map(r => r.length))
  for (let r = 0; r < most; r++) per.forEach(rs => rs[r] && pending.push(...rs[r]))
  const last = {}, rows = []; let slot = 0, cur = naive(start)
  const roll = dayEnd != null && nextStart != null && dayEnd - nextStart >= len
  while (pending.length && courts.length && slot < 3000) {
    if (roll && minOfDay(cur) + len > dayEnd) cur = nextDay(cur, nextStart)
    const busy = new Set()
    for (const court of courts) {
      let best = -1, bestRest = -1
      pending.forEach((m, i) => { // prefer the pair whose teams have rested the longest
        if (busy.has(m.a) || busy.has(m.b)) return
        const rest = slot - Math.max(last[m.a] ?? -9, last[m.b] ?? -9)
        if (rest > bestRest) { best = i; bestRest = rest }
      })
      if (best < 0) break
      const [m] = pending.splice(best, 1); busy.add(m.a); busy.add(m.b); last[m.a] = slot; last[m.b] = slot
      rows.push({ team1: m.a, team2: m.b, grp: m.g, court, slot, local: asLocal(cur) })
    }
    cur += len * 6e4; slot++
  }
  return { rows, slots: slot }
}

export function FixtureGenerator({ tm, ms, tid, courts, settings, load }) {
  const defStart = () => { const d = new Date(); d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0); return d.toISOString() }
  const [open, setOpen] = useState(false)
  const [f, setF] = useState(() => ({ start_at: defStart(), len: settings.duration || 30, fmt: settings.fmt, nonstop: false, dayEnd: 18 * 60, nextStart: 8 * 60, picked: courts }))
  const useCourts = courts.filter(c => f.picked.includes(c))
  const groups = useMemo(() => { const g = {}; tm.forEach(t => { (g[t.grp] = g[t.grp] || []).push(t.id) }); return g }, [tm])
  const have = useMemo(() => new Set(ms.filter(m => m.round === 'Group Stage' && m.team1 && m.team2).map(m => key(m.team1, m.team2))), [ms])
  const bad = !f.nonstop && f.dayEnd - f.nextStart < f.len
  const plan = useMemo(() => open && !bad ? planFixtures({ groups, have, courts: useCourts, start: toLocal(f.start_at), len: +f.len, dayEnd: f.nonstop ? null : f.dayEnd, nextStart: f.nonstop ? null : f.nextStart }) : null,
    [open, bad, groups, have, f.start_at, f.len, f.nonstop, f.dayEnd, f.nextStart, f.picked.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  const names = Object.fromEntries(tm.map(t => [t.id, tn(t)]))
  const sizes = Object.keys(groups).sort().map(g => `${g}: ${groups[g].length}`).join(' · ')
  const days = plan ? [...new Set(plan.rows.map(r => r.local.slice(0, 10)))].length : 0
  const lastRow = plan && plan.rows[plan.rows.length - 1]
  const clashes = plan ? plan.rows.filter(r => ms.some(o => o.status !== 'finished' && o.court === r.court && clash({ start_at: fromLocal(r.local), duration: +f.len }, o))).length : 0
  const go = async () => {
    const rows = plan.rows.map(r => ({ tournament_id: tid, team1: r.team1, team2: r.team2, court: r.court, round: 'Group Stage', start_at: fromLocal(r.local), duration: +f.len, golden: settings.golden, ...fmtRow(f.fmt) }))
    if (!confirm(`Buat ${rows.length} pertandingan grup?`)) return
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await supabase.from('matches').insert(rows.slice(i, i + 100))
      if (error) { alert(error.message); load(); return }
    }
    log('Membuat jadwal babak grup', `${rows.length} pertandingan, ${Object.keys(groups).length} grup`); setOpen(false); load()
  }
  const clear = async () => {
    const n = ms.filter(m => m.round === 'Group Stage' && m.status === 'scheduled').length
    if (!n) return alert('Tidak ada pertandingan grup yang belum dimainkan untuk dihapus.')
    if (!confirm(`Hapus ${n} pertandingan grup yang belum dimulai? Pertandingan yang sedang berlangsung atau sudah selesai tidak dihapus.`)) return
    const { error } = await supabase.from('matches').delete().eq('tournament_id', tid).eq('round', 'Group Stage').eq('status', 'scheduled')
    if (error) return alert(error.message)
    log('Menghapus pertandingan grup yang belum main', `${n} pertandingan`); load()
  }
  return <div className="panel">
    <div className="ph"><h3>Buat jadwal babak grup otomatis</h3><button className="btn o sm" onClick={() => setOpen(!open)}>{open ? 'Tutup' : 'Buka'}</button></div>
    <p className="muted">Membuat semua pertandingan grup (setiap tim melawan semua tim lain di grupnya satu kali) dan membaginya ke lapangan dan hari yang tersedia. Satu tim tidak akan main dua kali di jam yang sama dan diberi jeda istirahat bila memungkinkan. Pasangan yang sudah punya pertandingan dilewati.</p>
    {open && <>
      <div className="fm">
        <div className="full"><DT value={f.start_at} onChange={v => setF({ ...f, start_at: v })} /></div>
        <label className="fl">Menit per pertandingan<select value={f.len} onChange={e => setF({ ...f, len: +e.target.value })}>{[15, 20, 25, 30, 40, 45, 60, 75, 90].map(x => <option key={x} value={x}>{x} menit</option>)}</select></label>
        <label className="fl">Format skor<select value={f.fmt} onChange={e => setF({ ...f, fmt: e.target.value })}>{fmtOptions(f.fmt).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="chk full"><input type="checkbox" checked={f.nonstop} onChange={e => setF({ ...f, nonstop: e.target.checked })} /> Main nonstop (tanpa jam selesai harian)</label>
        {!f.nonstop && <><TimeOfDay label="Pertandingan terakhir selesai pukul" min={f.dayEnd} onChange={v => setF({ ...f, dayEnd: v })} /><TimeOfDay label="Hari berikutnya mulai pukul" min={f.nextStart} onChange={v => setF({ ...f, nextStart: v })} /></>}
        <div className="full"><small className="muted">Lapangan yang dipakai</small><div className="ctrl">{courts.map(c => <label key={c} className="chk"><input type="checkbox" checked={f.picked.includes(c)} onChange={e => setF({ ...f, picked: e.target.checked ? [...f.picked, c] : f.picked.filter(x => x !== c) })} /> {c}</label>)}</div></div>
      </div>
      {bad && <p className="err">Rentang antara "hari berikutnya mulai" dan "pertandingan terakhir selesai" lebih pendek dari satu pertandingan.</p>}
      {!useCourts.length && <p className="err">Pilih minimal satu lapangan.</p>}
      {!tm.length && <p className="err">Tambahkan tim dulu.</p>}
      {plan && <div className="imps">
        <p>Grup ({sizes || 'belum ada'}). <b>{plan.rows.length}</b> pertandingan baru dalam <b>{plan.slots}</b> slot waktu selama <b>{days}</b> hari{lastRow ? <>; yang terakhir mulai {fmtTime(fromLocal(lastRow.local))} pada {fmtDate(fromLocal(lastRow.local))}</> : ''}.</p>
        {clashes > 0 && <p className="warnline">⚠ {clashes} pertandingan baru bertabrakan dengan pertandingan yang sudah ada di lapangan yang sama.</p>}
        {plan.rows.length > 0 && <div className="scroll"><table className="tb left"><tbody>{plan.rows.slice(0, 16).map((r, i) => <tr key={i}><td className="nw">{fmtDate(fromLocal(r.local))} {fmtTime(fromLocal(r.local))}</td><td>{r.court}</td><td>Grup {r.grp}</td><td><b>{names[r.team1]}</b> vs <b>{names[r.team2]}</b></td></tr>)}</tbody></table></div>}
        {plan.rows.length > 16 && <p className="muted">Menampilkan 16 pertama dari {plan.rows.length}.</p>}
        {!plan.rows.length && <p className="muted">Tidak ada yang perlu dibuat: semua pasangan di semua grup sudah punya pertandingan, atau tiap grup kurang dari 2 tim.</p>}
      </div>}
      <div className="ctrl"><button className="btn" disabled={!plan || !plan.rows.length} onClick={go}>Buat {plan ? plan.rows.length : 0} pertandingan</button></div>
    </>}
    <div className="ctrl"><button className="btn o sm danger" onClick={clear}>Hapus semua pertandingan grup yang belum main</button></div>
  </div>
}

// ---------- Acak grup ----------
const shuffle = a => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]] } return x }
export function DrawGroups({ tm, ms, load }) {
  const [open, setOpen] = useState(false), [n, setN] = useState(2), [mode, setMode] = useState('random')
  const per = Array.from({ length: n }, (_, g) => tm.filter((_, i) => i % n === g).length).join(' / ')
  const draw = async () => {
    const existing = ms.filter(m => m.round === 'Group Stage').length
    const warn = existing ? `\n\n${existing} pertandingan grup sudah ada dan tetap memakai tim lamanya. Hapus lalu buat ulang jadwal setelah pengacakan.` : ''
    if (!confirm(`Bagi ${tm.length} tim ke ${n} grup ${mode === 'random' ? 'secara acak' : 'sesuai urutan daftar'}? Grup tiap tim yang sekarang akan diganti.${warn}`)) return
    const order = mode === 'random' ? shuffle(tm) : [...tm]
    const rs = await Promise.all(order.map((t, i) => supabase.from('teams').update({ grp: GROUPS[i % n] }).eq('id', t.id))), er = rs.find(r => r.error)
    if (er) alert(er.error.message); else { log('Mengacak grup', `${tm.length} tim ke ${n} grup (${mode === 'random' ? 'acak' : 'urut'})`); setOpen(false) }
    load()
  }
  return <div className="imp">
    <button className="btn o sm" onClick={() => setOpen(!open)}>{open ? 'Tutup acak grup' : 'Acak grup'}</button>
    {open && <div className="editbox">
      <p className="muted">Membagi semua tim di kategori ini secara merata ke beberapa grup. Dengan {tm.length} tim dan {n} grup: <b>{per}</b> tim per grup.</p>
      <div className="fm">
        <select value={n} onChange={e => setN(+e.target.value)}>{[1, 2, 3, 4, 5, 6, 7, 8].map(x => <option key={x} value={x}>{x} grup</option>)}</select>
        <select value={mode} onChange={e => setMode(e.target.value)}><option value="random">Acak</option><option value="order">Sesuai urutan daftar (A, B, A, B…)</option></select>
      </div>
      <div className="ctrl"><button className="btn sm" disabled={tm.length < 2} onClick={draw}>Acak sekarang</button></div>
    </div>}
  </div>
}

// ---------- Cek sistem: menemukan langkah SQL yang terlewat sebelum acara dimulai ----------
export function SystemCheck() {
  const [rows, setRows] = useState(null), [busy, setBusy] = useState(false)
  const check = async () => {
    setBusy(true); const out = [], add = (name, state, msg = '') => out.push({ name, state, msg })
    for (const tb of ['tournaments', 'teams', 'matches', 'staff', 'announcements', 'settings', 'audit_log', 'backups']) {
      const r = await supabase.from(tb).select('*').limit(1); add(`Tabel: ${tb}`, r.error ? 'bad' : 'ok', r.error ? r.error.message : '')
    }
    const c = await supabase.from('matches').select('scoring,locked,wo,referee,notes').limit(1)
    add('Kolom pertandingan (skor, kunci, walkover, catatan)', c.error ? 'bad' : 'ok', c.error ? c.error.message : '')
    const pc = await supabase.from('matches').select('points').limit(1)
    add('Kolom riwayat poin (points)', pc.error ? 'bad' : 'ok', pc.error ? pc.error.message : '')
    const mc = await supabase.from('matches').select('manual').limit(1)
    add('Kolom bagan manual (manual)', mc.error ? 'bad' : 'ok', mc.error ? mc.error.message + ' — jalankan bagian v9 di supabase.sql.' : '')
    const f = await supabase.rpc('admin_reset_password', { target: '00000000-0000-0000-0000-000000000000', new_password: 'systemcheck' })
    add('Fungsi: reset password panitia', f.error && /could not find|schema cache|does not exist/i.test(f.error.message) ? 'bad' : 'ok', f.error && /could not find|schema cache|does not exist/i.test(f.error.message) ? f.error.message : '')
    const rt = await new Promise(res => {
      const ch = supabase.channel('syscheck-' + Date.now()), to = setTimeout(() => { supabase.removeChannel(ch); res(false) }, 6000)
      ch.subscribe(s => { if (s === 'SUBSCRIBED') { clearTimeout(to); supabase.removeChannel(ch); res(true) } })
    })
    add('Update langsung (koneksi realtime)', rt ? 'ok' : 'warn', rt ? '' : 'Tidak tersambung dalam 6 detik. Periksa koneksi internet; skor mungkin perlu dimuat ulang manual.')
    const s = await supabase.from('settings').select('id').eq('id', 'main').maybeSingle()
    add('Pengaturan situs tersimpan', s.data ? 'ok' : 'warn', s.data ? '' : 'Belum ada yang tersimpan, pengaturan bawaan dipakai. Buka Tampilan Situs lalu tekan Simpan sekali.')
    const a = await supabase.from('staff').select('role').eq('role', 'admin')
    add('Minimal satu akun admin', a.data && a.data.length ? 'ok' : 'bad', a.error ? a.error.message : '')
    add('Koneksi aman (https)', location.protocol === 'https:' || location.hostname === 'localhost' ? 'ok' : 'warn', 'Notifikasi dan "Pasang aplikasi" hanya bekerja lewat https.')
    const sw = navigator.serviceWorker ? await navigator.serviceWorker.getRegistration().catch(() => null) : null
    add('Aplikasi bisa dipasang (service worker)', sw ? 'ok' : 'warn', sw ? '' : 'Belum aktif. Aktif di situs yang sudah di-deploy setelah halaman dimuat penuh satu kali; mati saat dijalankan lokal.')
    setRows(out); setBusy(false)
  }
  useEffect(() => { check() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const bad = rows ? rows.filter(r => r.state === 'bad').length : 0, warn = rows ? rows.filter(r => r.state === 'warn').length : 0
  return <div className="panel"><div className="ph"><h3>Cek sistem</h3><button className="btn o sm" disabled={busy} onClick={check}>{busy ? 'Memeriksa…' : 'Periksa lagi'}</button></div>
    <p className="muted">Memastikan database sudah siap untuk versi ini. Jalankan setiap selesai pembaruan dan sebelum acara dimulai.</p>
    {rows && <p className={bad ? 'err' : ''}><b>{bad ? `${bad} masalah` : warn ? `Siap, dengan ${warn} catatan` : 'Semua siap'}</b>{bad ? ' — jalankan supabase.sql terbaru di Supabase > SQL Editor, lalu tekan "Periksa lagi".' : ''}</p>}
    {rows && <div className="items">{rows.map(r => <div className="item sc" key={r.name}><span className={'dot ' + r.state}>{r.state === 'ok' ? '✓' : r.state === 'bad' ? '✕' : '!'}</span><div className="im"><b>{r.name}</b>{r.msg && <small>{r.msg}</small>}</div></div>)}</div>}
  </div>
}
