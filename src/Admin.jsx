import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { supabase, SB_URL, SB_KEY } from './supabase'
import { useOutbox, overlay, setSyncHook } from './outbox'
import { ScorerHome, SyncBadge } from './Scorer'
import { EventSettings } from './Event'
import { StandingsPanel } from './AdminRank'
import { resolve } from './standings'
import { emailOf, tourSub, fmtDate, fmtTime } from './util'
import { log, ExportPanel, HistoryPanel, SiteSettings, TimeSettings, RuleSettings, CourtsPanel, BackupPanel } from './AdminExtra'
import { Dashboard } from './AdminDash'
import { SystemCheck } from './AdminTools'
import { Matches } from './AdminMatches'
import { Teams, Categories } from './AdminTeams'
import { BracketPage } from './AdminBracket'

function Login({ onBack, notice }) {
  const [u, setU] = useState(''), [p, setP] = useState(''), [show, setShow] = useState(false), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const go = async e => {
    e.preventDefault(); setBusy(true); setErr('')
    const { error } = await supabase.auth.signInWithPassword({ email: emailOf(u), password: p })
    if (error) setErr(error.message === 'Invalid login credentials' ? 'Nama pengguna atau password salah.' : error.message)
    setBusy(false)
  }
  return <div className="login">
    <div className="lp">
      <div className="logo">Court<span>line</span></div>
      <div className="lpm"><h1>Kelola hari pertandingan<br />dengan tenang.</h1><p>Atur jadwal, catat skor poin demi poin, dan jaga semua lapangan tetap sinkron secara langsung.</p></div>
    </div>
    <form className="lf" onSubmit={go}>
      <button type="button" className="link" onClick={onBack}>← Kembali ke halaman penonton</button>
      <h2>Selamat datang</h2><p className="muted">Masuk ke konsol admin.</p>
      <label className="fl">Nama pengguna<input autoCapitalize="none" autoComplete="username" required value={u} onChange={e => setU(e.target.value)} placeholder="admin" /></label>
      <label className="fl">Password<div className="pw"><input type={show ? 'text' : 'password'} autoComplete="current-password" required value={p} onChange={e => setP(e.target.value)} placeholder="••••••••" />
        <button type="button" className="link" onClick={() => setShow(!show)}>{show ? 'Sembunyikan' : 'Lihat'}</button></div></label>
      {notice && !err && <div className="muted">{notice}</div>}
      {err && <div className="err">{err}</div>}
      <button className="btn big" disabled={busy}>{busy ? 'Sedang masuk…' : 'Masuk'}</button>
      <small className="muted">Khusus panitia yang berwenang.</small>
    </form>
  </div>
}

function Announce({ ann, run }) {
  const [f, setF] = useState({ message: '', level: 'info' })
  const add = e => {
    e.preventDefault()
    const message = f.message.trim(); if (!message) return
    run(supabase.from('announcements').insert({ message, level: f.level }), 'Membuat pengumuman', message); setF({ message: '', level: 'info' })
  }
  return <div className="panel"><h3>Pengumuman</h3>
    <p className="muted">Tampil sebagai banner di bagian atas semua halaman dan di layar TV selama masih ditampilkan. Penonton yang mengaktifkan "Beri tahu saya" juga mendapat notifikasi.</p>
    <form className="fm" onSubmit={add}>
      <input required className="wide" maxLength={200} placeholder="mis. Jadwal mundur 30 menit karena hujan" value={f.message} onChange={e => setF({ ...f, message: e.target.value })} />
      <select value={f.level} onChange={e => setF({ ...f, level: e.target.value })}><option value="info">Info</option><option value="warning">Penting</option></select>
      <button className="btn">Kirim</button>
    </form>
    <div className="items">{ann.map(a => <div className="item" key={a.id}>
      <div className="im"><b>{a.message}</b><small>{a.level === 'warning' ? 'Penting' : 'Info'} · {a.active ? 'Ditampilkan' : 'Disembunyikan'} · {fmtDate(a.created_at)} {fmtTime(a.created_at)}</small></div>
      <div className="ia">
        <button className="btn o sm" onClick={() => run(supabase.from('announcements').update({ active: !a.active }).eq('id', a.id), a.active ? 'Menyembunyikan pengumuman' : 'Menampilkan pengumuman', a.message)}>{a.active ? 'Sembunyikan' : 'Tampilkan'}</button>
        <button className="btn o sm danger" onClick={() => confirm('Hapus pengumuman ini?') && run(supabase.from('announcements').delete().eq('id', a.id), 'Menghapus pengumuman', a.message)}>Hapus</button>
      </div></div>)}</div>
    {!ann.length && <p className="muted">Belum ada pengumuman.</p>}
  </div>
}

function AccountPage({ me, admin, run }) {
  const [np, setNp] = useState(''), [cp, setCp] = useState(''), [staff, setStaff] = useState([]), [nf, setNf] = useState({ username: '', password: '', role: 'scorer' })
  const loadStaff = () => admin && supabase.from('staff').select('*').order('created_at').then(r => setStaff(r.data || []))
  useEffect(() => { loadStaff() }, [admin])
  const changePw = async e => {
    e.preventDefault()
    if (np.length < 6) return alert('Password minimal 6 karakter')
    if (np !== cp) return alert('Password tidak sama')
    const { error } = await supabase.auth.updateUser({ password: np })
    if (error) return alert(error.message)
    setNp(''); setCp(''); alert('Password diperbarui')
  }
  const addUser = async e => {
    e.preventDefault()
    const tmp = createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
    const { data, error } = await tmp.auth.signUp({ email: emailOf(nf.username), password: nf.password })
    if (error) return alert(error.message)
    if (!data.user) return alert('Akun tidak bisa dibuat')
    const r = await supabase.from('staff').insert({ user_id: data.user.id, username: nf.username.trim().toLowerCase(), role: nf.role })
    if (r.error) return alert(r.error.message)
    log('Menambah akun', `${nf.username.trim().toLowerCase()} (${nf.role})`); setNf({ username: '', password: '', role: 'scorer' }); loadStaff()
  }
  const resetPw = async u => {
    const pw = prompt(`Password baru untuk ${u.username} (minimal 6 karakter):`)
    if (!pw) return
    const { error } = await supabase.rpc('admin_reset_password', { target: u.user_id, new_password: pw })
    if (error) return alert(error.message + (/function|schema cache/i.test(error.message) ? '\nJalankan supabase.sql terbaru dulu.' : ''))
    log('Reset password', u.username); alert(`Password ${u.username} direset. Berikan password baru kepada yang bersangkutan.`)
  }
  return <>
    <div className="panel"><h3>Ganti password</h3><p className="muted">Masuk sebagai <b>{me.username}</b>. Pilih password yang kuat dan tidak dipakai di tempat lain.</p>
      <form className="fm" onSubmit={changePw}>
        <input type="password" autoComplete="new-password" placeholder="Password baru" value={np} onChange={e => setNp(e.target.value)} />
        <input type="password" autoComplete="new-password" placeholder="Ulangi password baru" value={cp} onChange={e => setCp(e.target.value)} />
        <button className="btn">Simpan password</button></form></div>
    {admin && <>
      <div className="panel"><h3>Akun panitia</h3><p className="muted"><b>Admin</b>: akses penuh. <b>Penjaga skor</b>: hanya boleh memulai pertandingan, memasukkan dan mengoreksi skor, mencatat walkover dan catatan. Peran bisa diubah kapan saja, dan password bisa direset jika lupa (kamu memberi password baru, password lama tidak berlaku lagi).</p>
        <form className="fm" onSubmit={addUser}>
          <input required placeholder="Nama pengguna" autoCapitalize="none" value={nf.username} onChange={e => setNf({ ...nf, username: e.target.value })} />
          <input required type="password" placeholder="Password (min. 6)" value={nf.password} onChange={e => setNf({ ...nf, password: e.target.value })} />
          <select value={nf.role} onChange={e => setNf({ ...nf, role: e.target.value })}><option value="scorer">Penjaga skor</option><option value="admin">Admin</option></select>
          <button className="btn">Tambah akun</button></form>
        <div className="scroll"><table className="tb left"><tbody>{staff.map(s => <tr key={s.user_id}><td><b>{s.username}</b>{s.user_id === me.user_id && <small> (kamu)</small>}</td>
          <td>{s.user_id === me.user_id ? s.role : <select value={s.role} onChange={e => run(supabase.from('staff').update({ role: e.target.value }).eq('user_id', s.user_id), 'Mengubah peran', `${s.username} → ${e.target.value}`).then(loadStaff)}><option value="scorer">penjaga skor</option><option value="admin">admin</option></select>}</td>
          <td className="ra">{s.user_id !== me.user_id && <><button className="btn o sm" onClick={() => resetPw(s)}>Reset password</button>{' '}
            <button className="btn o sm danger" onClick={() => confirm(`Cabut akses ${s.username}?`) && run(supabase.from('staff').delete().eq('user_id', s.user_id), 'Mencabut akun', s.username).then(loadStaff)}>Cabut</button></>}</td></tr>)}</tbody></table></div></div>
    </>}
  </>
}


// ---------- Menu admin: 4 kelompok, setiap halaman punya satu tugas ----------
const GI = {
  day: <><circle cx="12" cy="12" r="3" /><path d="M6.3 6.3a8 8 0 000 11.4M17.7 6.3a8 8 0 010 11.4" /></>,
  setup: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  results: <path d="M8 4h8v5a4 4 0 01-8 0zM8 6H4v1a3 3 0 003 3M16 6h4v1a3 3 0 01-3 3M12 13v4M8 20h8" />,
  system: <><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></>
}
const PI = { overview: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  scorer: <><rect x="7" y="2.5" width="10" height="19" rx="2" /><path d="M11 18h2" /></>, control: GI.setup, announcements: <path d="M4 10v4h3l7 4V6L7 10zM17 9a4 4 0 010 6" />,
  tournaments: <><path d="M4 6h16M4 12h16M4 18h10" /></>, teams: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0112 0M16 5a3.2 3.2 0 010 6M18 20a6 6 0 00-3-5.2" /></>,
  fixtures: <path d="M12 5v14M5 12h14" />, timetable: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  standings: <path d="M5 20V10M12 20V4M19 20v-7" />, bracket: <path d="M4 5h5v4H4zM4 15h5v4H4zM15 10h5v4h-5zM9 7h3v10H9M12 12h3" />,
  matchhist: <path d="M5 4h14v16H5zM9 8h6M9 12h6M9 16h3" />,
  export: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />, site: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" /></>,
  rules: GI.system, accounts: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></>,
  backup: <><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
  history: <><path d="M3 12a9 9 0 109-9 9 9 0 00-6.7 3L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></> }
const PIcon = ({ id }) => <svg className="pi" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{PI[id]}</svg>

const NAV = [
  { id: 'day', label: 'Hari Pertandingan', pages: [
    { id: 'overview', label: 'Beranda', hint: 'Ringkasan seluruh acara: lapangan, pertandingan berikutnya, hasil, dan hal yang perlu perhatianmu.' },
    { id: 'scorer', label: 'Skor Lapangan', hint: 'Layar penuh untuk mencatat skor satu lapangan: dua tombol +1 besar dan Batalkan. Tetap aman walau sinyal lemah.' },
    { id: 'control', label: 'Kontrol Pertandingan', tour: 1, hint: 'Mulai pertandingan, tambah poin, koreksi skor, catat walkover dan catatan untuk setiap pertandingan.' },
    { id: 'announcements', label: 'Pengumuman', admin: 1, hint: 'Pesan yang tampil di bagian atas situs penonton dan di layar TV.' }] },
  { id: 'setup', label: 'Persiapan', admin: 1, pages: [
    { id: 'tournaments', label: 'Kategori', admin: 1, hint: '1. Mulai dari sini: buat kategori pertandingan (mis. Bronze, Beginner, Amatir). Bisa ditambah dan dihapus kapan saja.' },
    { id: 'teams', label: 'Tim & Pemain', admin: 1, tour: 1, hint: '2. Tambah tim satu per satu atau impor dari Excel, lalu acak grup.' },
    { id: 'fixtures', label: 'Buat Jadwal', admin: 1, tour: 1, hint: '3. Buat jadwal babak grup otomatis, atau tambahkan satu pertandingan.' },
    { id: 'timetable', label: 'Atur Jadwal', admin: 1, tour: 1, hint: 'Ubah jam dan lapangan, geser pertandingan, mundurkan semua jadwal, atau kunci hasil.' },
    { id: 'bracket', label: 'Bagan', admin: 1, tour: 1, hint: '4. Susun bagan semifinal/final: acak otomatis, atur manual, atau dari klasemen grup. Pemenang otomatis maju.' }] },
  { id: 'results', label: 'Hasil', admin: 1, pages: [
    { id: 'standings', label: 'Klasemen', admin: 1, hint: 'Tabel grup, peringatan jika seri, dan pengaturan urutan manual.' },
    { id: 'matchhist', label: 'Riwayat Pertandingan', admin: 1, tour: 1, hint: 'Lihat, koreksi, atau hapus pertandingan yang sudah selesai.' },
    { id: 'export', label: 'Unduh & Cetak', admin: 1, hint: 'Unduh hasil, klasemen, dan jadwal ke Excel, atau cetak ke PDF.' }] },
  { id: 'system', label: 'Sistem', pages: [
    { id: 'site', label: 'Tampilan Situs', admin: 1, hint: 'Nama acara, logo, warna, dan halaman Info untuk penonton.' },
    { id: 'rules', label: 'Aturan & Lapangan', admin: 1, hint: 'Zona waktu, aturan skor bawaan, dan daftar lapangan.' },
    { id: 'accounts', label: 'Akun', hint: 'Ganti password. Admin juga bisa menambah akun panitia dan mereset password.' },
    { id: 'backup', label: 'Cadangan & Cek Sistem', admin: 1, hint: 'Cadangkan dan pulihkan data, kosongkan data uji coba, dan cek apakah sistem sudah siap.' },
    { id: 'history', label: 'Log Perubahan', admin: 1, hint: 'Siapa mengubah apa, dan kapan.' }] }
]

export default function Admin({ matches: serverMatches, teams, tours, ann = [], settings, tid, load, onBack, onPrint }) {
  const [session, setSession] = useState(undefined), [me, setMe] = useState(null), [page, setPageS] = useState(() => { try { return sessionStorage.getItem('adm_page') || '' } catch { return '' } }), [at, setAt] = useState(''), [focusId, setFocusId] = useState(null)
  const setPage = p => { setPageS(p); try { sessionStorage.setItem('adm_page', p) } catch {} window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const [menu, setMenu] = useState(false), ob = useOutbox(), sig = useRef('')
  const matches = useMemo(() => overlay(serverMatches, ob.items), [serverMatches, ob.items]) // poin yang belum terkirim dari HP ini tampil di atas data server
  useEffect(() => { setSyncHook(load); return () => setSyncHook(null) }, [load])
  useEffect(() => { if (me && me.role !== 'admin') setPage('scorer') }, [me && me.user_id]) // penjaga skor langsung ke layar skor
  useEffect(() => {
    supabase.auth.getSession().then(r => setSession(r.data.session))
    const { data } = supabase.auth.onAuthStateChange((_, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  // Keluar otomatis jika tidak ada aktivitas (admin 30 menit, penjaga skor 2 jam). Ditunda selama masih ada skor belum terkirim.
  const obRef = useRef(ob); obRef.current = ob
  const [notice, setNotice] = useState('')
  useEffect(() => {
    if (!me) return
    const limit = (me.role === 'admin' ? 30 : 120) * 6e4
    let last = Date.now()
    const touch = () => { last = Date.now() }
    const check = () => {
      if (Date.now() - last > limit && !obRef.current.ops) { setNotice('Kamu keluar otomatis karena lama tidak aktif. Silakan masuk lagi.'); supabase.auth.signOut() }
    }
    const vis = () => { if (!document.hidden) check() } // cek langsung saat tab dibuka kembali, bukan menunggu timer
    const evs = ['pointerdown', 'keydown', 'touchstart', 'scroll']
    evs.forEach(e => window.addEventListener(e, touch, { passive: true }))
    document.addEventListener('visibilitychange', vis)
    const i = setInterval(check, 30000)
    return () => { evs.forEach(e => window.removeEventListener(e, touch)); document.removeEventListener('visibilitychange', vis); clearInterval(i) }
  }, [me && me.user_id])
  useEffect(() => {
    if (!session) return setMe(null)
    supabase.from('staff').select('*').eq('user_id', session.user.id).maybeSingle().then(r => setMe(r.data || false))
  }, [session])
  useEffect(() => { // cadangan otomatis: jika jadwal cadangan tidak jalan, admin yang membuka konsol membuatnya
    if (!me || me.role !== 'admin') return
    supabase.from('backups').select('created_at').order('created_at', { ascending: false }).limit(1).then(r => {
      if (r.error) return
      const last = r.data && r.data[0] && r.data[0].created_at
      if (!last || Date.now() - +new Date(last) > 6 * 36e5) supabase.rpc('make_backup', { k: 'auto' }).then(() => {}, () => {})
    })
  }, [me && me.user_id])
  useEffect(() => { if (!tours.some(x => x.id === at)) setAt(tid !== 'all' && tours.some(x => x.id === tid) ? tid : tours[0]?.id || '') }, [tours, tid])

  // Bagan otomatis: slot seperti "Juara 1 Grup A" atau "Pemenang SF1" diisi tim sungguhan begitu hasilnya pasti.
  // Jika skor dikoreksi, pertandingan berikutnya yang BELUM dimulai ikut menyesuaikan. Pilihan manual admin (kolom manual) tidak ditimpa.
  useEffect(() => {
    if (!me) return
    const ups = []
    tours.forEach(tr => {
      const tm = teams.filter(x => x.tournament_id === tr.id), ms = matches.filter(x => x.tournament_id === tr.id)
      ms.forEach(m => {
        const col = 'manual' in m
        if (col && m.manual) return
        const patch = {}
        ;[1, 2].forEach(k => {
          const slot = m['slot' + k]; if (!slot) return
          const cur = m['team' + k], id = resolve(slot, tm, ms)
          if (id) { if (id !== cur && (!cur || (col && m.status === 'scheduled'))) patch['team' + k] = id }
          else if (cur && col && m.status === 'scheduled') patch['team' + k] = null
        })
        if (Object.keys(patch).length) ups.push([m.id, patch])
      })
    })
    const s = JSON.stringify(ups)
    if (!ups.length) { sig.current = ''; return }
    if (s === sig.current) return // jangan ulangi percobaan yang sama jika gagal (mis. tidak punya izin)
    sig.current = s
    Promise.all(ups.map(([id, v]) => supabase.from('matches').update(v).eq('id', id))).then(load)
  }, [matches, teams, me])

  useEffect(() => { // kunci scroll + Esc saat menu terbuka
    if (!menu) return
    const k = e => e.key === 'Escape' && setMenu(false), o = document.body.style.overflow
    document.body.style.overflow = 'hidden'; window.addEventListener('keydown', k)
    return () => { document.body.style.overflow = o; window.removeEventListener('keydown', k) }
  }, [menu])

  if (session === undefined) return null
  if (!session) return <Login onBack={onBack} notice={notice} />
  if (me === null) return <p className="muted">Memuat…</p>
  if (me === false) return <div className="empty">Akun ini tidak punya akses panitia.<br /><button className="btn" onClick={() => { setNotice(''); supabase.auth.signOut() }}>Keluar</button></div>
  const admin = me.role === 'admin'
  const run = async (p, act, detail) => { const { error } = await p; if (error) alert(error.message + (/check constraint|violates/i.test(error.message) ? '\n\nJalankan supabase.sql terbaru di Supabase > SQL Editor, lalu coba lagi.' : '')); else if (act) log(act, detail); load(); return !error }
  const save = async (patch, act, detail) => {
    const { error } = await supabase.from('settings').upsert({ id: 'main', data: { ...settings, ...patch }, updated_at: new Date().toISOString() })
    if (error) { alert(error.message + (/relation|schema cache/i.test(error.message) ? '\nJalankan supabase.sql terbaru di Supabase dulu.' : '')); return false }
    log(act || 'Mengubah pengaturan', detail); load(); return true
  }
  const tm = teams.filter(x => x.tournament_id === at), ms = matches.filter(x => x.tournament_id === at), tour = tours.find(x => x.id === at)
  const groups = NAV.filter(g => admin || !g.admin).map(g => ({ ...g, pages: g.pages.filter(p => admin || !p.admin) })).filter(g => g.pages.length)
  const pages = groups.flatMap(g => g.pages.map(p => ({ ...p, g })))
  const cur = pages.find(p => p.id === page) || pages.find(p => p.id === (admin ? 'overview' : 'scorer'))
  const liveNow = matches.filter(m => m.status === 'live').length
  const go = id => setPage(id)
  const focus = id => { setFocusId(id); if (id) setPage('control') }
  const label = p => p.id === 'accounts' && !admin ? 'Password Saya' : p.label
  const view = ['control', 'fixtures', 'timetable', 'matchhist'].includes(cur.id) ? cur.id : null
  const pick = id => { setMenu(false); go(id) }
  const courts = (settings.courts && settings.courts.length ? settings.courts : ['Court 1', 'Court 2', 'Court 3', 'Court 4'].map(name => ({ name, active: true }))).filter(c => c.active).map(c => c.name)
  return <div className="adm">
    <div className="abar">
      <button className="burger" onClick={() => setMenu(true)} aria-label="Buka menu" aria-expanded={menu}><span /><span /><span /></button>
      <div className="abt"><small>{cur.g.label}</small><b>{label(cur)}</b></div>
      <div className="abr"><SyncBadge />{liveNow > 0 && <button className="lvp" onClick={() => go('control')}><i />{liveNow} live</button>}</div>
    </div>
    <div className={'drw' + (menu ? ' open' : '')} aria-hidden={!menu}>
      <div className="drb" onClick={() => setMenu(false)} />
      <aside className="drp" role="dialog" aria-label="Menu admin">
        <div className="drh"><div className="av">{(me.username || '?').slice(0, 1).toUpperCase()}</div><div><b>{me.username}</b><small>{admin ? 'admin' : 'penjaga skor'}</small></div>
          <button className="drx" onClick={() => setMenu(false)} aria-label="Tutup menu">×</button></div>
        <nav className="dnav" aria-label="Bagian admin">{groups.map(g => <div key={g.id} className="dg">
          <div className="dgl"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{GI[g.id]}</svg>{g.label}</div>
          {g.pages.map(p => <button key={p.id} tabIndex={menu ? 0 : -1} className={'dp' + (p.id === cur.id ? ' on' : '')} onClick={() => pick(p.id)} aria-current={p.id === cur.id ? 'page' : undefined}>
            <PIcon id={p.id} /><span>{label(p)}</span>{p.id === 'control' && liveNow > 0 && <i className="lv">{liveNow} live</i>}</button>)}
        </div>)}</nav>
        <div className="drf"><button className="btn o sm" onClick={onBack}>← Halaman penonton</button><button className="btn o sm danger" onClick={() => { if (ob.ops && !confirm(`Masih ada ${ob.ops} poin belum terkirim dari HP ini. Jika keluar, poin baru dikirim setelah login lagi. Tetap keluar?`)) return; setNotice(''); supabase.auth.signOut() }}>Keluar</button></div>
      </aside>
    </div>
    <div className="alay">
      <section className="apage">
        <header className={'aphead' + (cur.id === 'overview' ? ' hide' : '')}><div className="crumb">{cur.g.label} › {label(cur)}</div><h2>{label(cur)}</h2><p>{cur.hint}</p></header>
        {cur.tour && (tours.length ? <div className="tbar"><label htmlFor="admtour">Kategori</label>
          <select id="admtour" value={at} onChange={e => setAt(e.target.value)}>{tours.map(x => <option key={x.id} value={x.id}>{x.name}{tourSub(x) ? ' · ' + tourSub(x) : ''}</option>)}</select>
          <span className="chip">{tm.length} tim</span><span className="chip">{ms.length} pertandingan</span></div>
          : <div className="empty">Buat kategori dulu{admin ? '.' : ' (minta admin).'}{admin && <button className="btn" onClick={() => go('tournaments')}>Buat kategori</button>}</div>)}
        {(!cur.tour || (tours.length > 0 && at)) && <>
          {cur.id === 'overview' && <Dashboard me={me} admin={admin} matches={matches} teams={teams} tours={tours} ann={ann} settings={settings} go={go} openMatch={focus} />}
          {cur.id === 'scorer' && <ScorerHome matches={matches} settings={settings} />}
          {view && <Matches key={view} view={view} tm={tm} ms={ms} tid={at} admin={admin} run={run} load={load} settings={settings} focusId={focusId} onFocus={focus} go={go} />}
          {cur.id === 'bracket' && admin && <BracketPage tour={tour} tm={tm} ms={ms} tid={at} courts={courts} settings={settings} run={run} load={load} onFocus={focus} />}
          {cur.id === 'announcements' && admin && <Announce ann={ann} run={run} />}
          {cur.id === 'tournaments' && admin && <Categories tours={tours} teams={teams} matches={matches} run={run} />}
          {cur.id === 'teams' && admin && <Teams tm={tm} ms={ms} tid={at} run={run} load={load} settings={settings} />}
          {cur.id === 'standings' && admin && <StandingsPanel tours={tours} teams={teams} matches={matches} settings={settings} save={save} />}
          {cur.id === 'export' && admin && <ExportPanel tours={tours} teams={teams} matches={matches} at={at} onPrint={onPrint} />}
          {cur.id === 'site' && admin && <><SiteSettings settings={settings} save={save} /><EventSettings settings={settings} save={save} /></>}
          {cur.id === 'rules' && admin && <><TimeSettings settings={settings} save={save} /><RuleSettings settings={settings} save={save} /><CourtsPanel settings={settings} save={save} /></>}
          {cur.id === 'accounts' && <AccountPage me={me} admin={admin} run={run} />}
          {cur.id === 'backup' && admin && <><BackupPanel load={load} /><SystemCheck /></>}
          {cur.id === 'history' && admin && <HistoryPanel />}
        </>}
      </section>
    </div>
  </div>
}
