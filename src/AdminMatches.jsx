import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { settle, isRace } from './score'
import { pointPatch, undoPatch, logAdd, logReset } from './engine'
import { enqueue } from './outbox'
import { Card } from './ui'
import { FORMATS, fmtOptions, fmtKey, fmtRow, clash, tn, fmtTime, activeCourts, scoreText, slotText } from './util'
import { log, mname, CourtSelect, WalkoverBox, NoteBox, Reorder } from './AdminExtra'
import { DT, FixtureGenerator, woSets } from './AdminTools'

export const ROUNDS = ['Group Stage', 'Round of 16', 'Quarterfinal', 'Semifinal', 'Third Place', 'Final']
const RN = { 'Group Stage': 'Babak Grup', 'Round of 16': '16 Besar', Quarterfinal: 'Perempat Final', Semifinal: 'Semifinal', 'Third Place': 'Perebutan Juara 3', Final: 'Final' }
export const roundName = r => RN[r] || r
const TBD = 'Belum ada'
const DURS = [15, 20, 25, 30, 40, 45, 60, 75, 90, 120]

function EditForm({ m, tm, courts, onSave, onCancel, onDelete }) {
  const fk = fmtKey(m)
  const [f, setF] = useState({ team1: m.team1 || '', team2: m.team2 || '', round: m.round, court: m.court, start_at: m.start_at, duration: m.duration || 60, fmt: fk, golden: m.golden })
  const set = k => e => setF({ ...f, [k]: e.target.value })
  return <div className="editbox">
    <h4>Ubah pertandingan</h4>
    <div className="fm">
      {['team1', 'team2'].map(k => <select key={k} value={f[k]} onChange={set(k)} aria-label={k === 'team1' ? 'Tim A' : 'Tim B'}><option value="">{slotText(m['slot' + k.slice(-1)]) || TBD}</option>{tm.map(t => <option key={t.id} value={t.id}>{tn(t)}</option>)}</select>)}
      <select value={f.round} onChange={set('round')}>{ROUNDS.map(r => <option key={r} value={r}>{roundName(r)}</option>)}</select>
      <CourtSelect value={f.court} courts={courts} onChange={v => setF({ ...f, court: v })} />
      <select value={f.fmt} onChange={set('fmt')}>{fmtOptions(fk).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      {FORMATS[f.fmt].scoring !== 'race' && <select value={f.golden} onChange={e => setF({ ...f, golden: e.target.value === 'true' })}><option value="true">Golden point</option><option value="false">Advantage</option></select>}
      <select value={f.duration} onChange={set('duration')}>{[...new Set([...DURS, +f.duration].filter(Boolean))].sort((a, b) => a - b).map(x => <option key={x} value={x}>{x} menit</option>)}</select>
      <div className="full"><DT value={f.start_at} onChange={v => setF({ ...f, start_at: v })} /></div>
    </div>
    {(m.slot1 || m.slot2) && <p className="muted">Pertandingan ini terisi otomatis dari hasil sebelumnya. Jika kamu memilih tim di sini, isian dikunci manual dan tidak akan diubah otomatis lagi (bisa dikembalikan lewat tombol "Kembalikan otomatis").</p>}
    <div className="ctrl"><button className="btn sm" onClick={() => onSave(f)}>Simpan perubahan</button><button className="btn o sm" onClick={onCancel}>Batal</button><button className="btn o sm danger" onClick={onDelete}>Hapus pertandingan</button></div>
  </div>
}

// Koreksi skor manual
function ScoreEdit(props) { return isRace(props.m) ? <RaceScoreEdit {...props} /> : <TennisScoreEdit {...props} /> }

function RaceScoreEdit({ m, onSave, onCancel }) {
  const start = m.status === 'finished' && m.sets[0] ? m.sets[0] : m.p
  const [p, setP] = useState(start.map(String))
  const names = [tn(m.t1) || 'Tim A', tn(m.t2) || 'Tim B']
  return <div className="editbox">
    <h4>Koreksi skor (balapan ke {m.target})</h4>
    <div className="se">
      <div className="sr head"><span /><b>{names[0]}</b><b>{names[1]}</b><span /></div>
      <div className="sr"><span>Poin</span>{[0, 1].map(j => <input key={j} type="number" inputMode="numeric" min="0" max={m.target} value={p[j]} onChange={e => setP(p.map((x, k) => k === j ? e.target.value : x))} />)}<span /></div>
    </div>
    <p className="muted">Tim yang lebih dulu mencapai {m.target} poin menang. Isi {m.target} pada pemenang untuk menyelesaikan pertandingan, atau skor lebih kecil agar pertandingan tetap berlangsung.</p>
    <div className="ctrl"><button className="btn sm" onClick={() => onSave({ race: true, p: p.map(x => Math.max(0, parseInt(x, 10) || 0)) })}>Simpan skor</button><button className="btn o sm" onClick={onCancel}>Batal</button></div>
  </div>
}

function TennisScoreEdit({ m, onSave, onCancel }) {
  const [sets, setSets] = useState(m.sets.map(s => [String(s[0]), String(s[1])]))
  const [g, setG] = useState(m.g.map(String)), [p, setP] = useState(m.p.map(String))
  const num = v => Math.max(0, Math.min(99, parseInt(v, 10) || 0))
  const setS = (i, j, v) => setSets(sets.map((s, k) => k === i ? s.map((x, l) => l === j ? v : x) : s))
  const names = [tn(m.t1) || 'Tim A', tn(m.t2) || 'Tim B']
  const two = (arr, fn) => [0, 1].map(j => <input key={j} type="number" inputMode="numeric" min="0" value={arr[j]} onChange={e => fn(j, e.target.value)} />)
  return <div className="editbox">
    <h4>Koreksi skor</h4>
    <div className="se">
      <div className="sr head"><span /><b>{names[0]}</b><b>{names[1]}</b><span /></div>
      {sets.map((s, i) => <div className="sr" key={i}><span>Set {i + 1}</span>{two(s, (j, v) => setS(i, j, v))}
        <button className="btn o sm danger" aria-label={`Hapus set ${i + 1}`} onClick={() => setSets(sets.filter((_, k) => k !== i))}>×</button></div>)}
      <div className="sr"><span>Game</span>{two(g, (j, v) => setG(g.map((x, k) => k === j ? v : x)))}<span /></div>
      <div className="sr"><span>Poin</span>{two(p, (j, v) => setP(p.map((x, k) => k === j ? v : x)))}<span /></div>
    </div>
    <p className="muted">Poin: 0, 1, 2, 3 = 0, 15, 30, 40 (saat tie-break isi poin sebenarnya). Game dan poin dikosongkan otomatis jika set sudah menentukan pemenang.</p>
    <div className="ctrl">
      {sets.length < 5 && <button className="btn o sm" onClick={() => setSets([...sets, ['0', '0']])}>+ Tambah set</button>}
      <button className="btn sm" onClick={() => onSave({ sets: sets.map(s => [num(s[0]), num(s[1])]), g: g.map(num), p: p.map(num) })}>Simpan skor</button>
      <button className="btn o sm" onClick={onCancel}>Batal</button>
    </div>
  </div>
}

// Hapus massal (per kategori). Pertandingan yang dihapus tidak bisa dikembalikan, kecuali dari cadangan.
function BulkDelete({ ms, tid, run, view }) {
  const n = { todo: ms.filter(m => m.status === 'scheduled').length, done: ms.filter(m => m.status === 'finished').length, all: ms.length }
  const wipe = (label, count, filter) => {
    if (!count) return alert('Tidak ada pertandingan yang cocok.')
    if (confirm(`Hapus ${count} pertandingan (${label})?\n\nTindakan ini tidak bisa dibatalkan.`)) run(filter(supabase.from('matches').delete().eq('tournament_id', tid)), 'Menghapus pertandingan', `${count} pertandingan (${label})`)
  }
  return <div className="panel"><h3>Hapus banyak pertandingan sekaligus</h3>
    <p className="muted">Berlaku untuk kategori yang dipilih di atas. Cocok untuk membersihkan data uji coba.{view === 'matchhist' ? ' Skor pertandingan yang dihapus tidak ikut dihitung lagi di klasemen.' : ''}</p>
    <div className="ctrl">
      <button className="btn o sm danger" onClick={() => wipe('belum dimulai', n.todo, q => q.eq('status', 'scheduled'))}>Hapus yang belum dimulai ({n.todo})</button>
      <button className="btn o sm danger" onClick={() => wipe('riwayat selesai', n.done, q => q.eq('status', 'finished'))}>Hapus semua riwayat selesai ({n.done})</button>
      <button className="btn o sm danger" onClick={() => wipe('semua', n.all, q => q.neq('id', '00000000-0000-0000-0000-000000000000'))}>Hapus semua pertandingan ({n.all})</button>
    </div></div>
}

export function Matches({ tm, ms, tid, admin, run, load, settings, view = 'control', focusId, onFocus, go }) {
  const def = () => { const d = new Date(); d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0); return d.toISOString() }
  const courts = activeCourts(settings)
  const [mf, setMf] = useState({ team1: '', team2: '', court: courts[0] || 'Court 1', round: 'Group Stage', fmt: settings.fmt, golden: settings.golden, start_at: def(), duration: settings.duration })
  const [dl, setDl] = useState(15), [editing, setEditing] = useState(null), [scoring, setScoring] = useState(null), [wob, setWob] = useState(null), [noting, setNoting] = useState(null)
  useEffect(() => { setMf(f => ({ ...f, fmt: settings.fmt, golden: settings.golden, duration: settings.duration })) }, [settings.fmt, settings.golden, settings.duration])
  const upd = (m, v, act, detail) => run(supabase.from('matches').update(v).eq('id', m.id), act, detail)
  const lockOn = settings.autoLock ? { locked: true } : {}
  const diff = (m, v) => [v.court && v.court !== m.court && `lapangan ${m.court} → ${v.court}`, v.start_at && v.start_at !== m.start_at && `jam ${fmtTime(m.start_at)} → ${fmtTime(v.start_at)}`,
    v.round && v.round !== m.round && `babak ${roundName(m.round)} → ${roundName(v.round)}`, (('team1' in v && v.team1 !== m.team1) || ('team2' in v && v.team2 !== m.team2)) && 'tim diganti'].filter(Boolean).join(', ')
  const warn = (c, ex = [c.id]) => ms.filter(o => !ex.includes(o.id) && o.status !== 'finished' && clash(o, c) && (o.court === c.court || [o.team1, o.team2].some(x => x && [c.team1, c.team2].includes(x))))
  const ask = c => { const w = warn(c); return !w.length || confirm(`Bentrok: ${w.length} pertandingan bertumpuk di lapangan yang sama atau dengan tim yang sama. Tetap lanjutkan?`) }

  const add = e => {
    e.preventDefault()
    if (mf.team1 === mf.team2) return alert('Pilih dua tim yang berbeda')
    const row = { tournament_id: tid, team1: mf.team1, team2: mf.team2, court: mf.court, round: mf.round, start_at: mf.start_at, duration: +mf.duration, golden: mf.golden, ...fmtRow(mf.fmt) }
    if (ask(row)) run(supabase.from('matches').insert(row), 'Menjadwalkan pertandingan', `${tn(tm.find(x => x.id === mf.team1))} vs ${tn(tm.find(x => x.id === mf.team2))} · ${row.court} · ${fmtTime(row.start_at)}`)
  }
  const edit = (m, v, act = 'Mengubah pertandingan') => { if (ask({ ...m, ...v })) upd(m, v, act, `${mname(m)}: ${diff(m, v)}`); else load() }
  const swap = async (a, b) => {
    const na = { start_at: b.start_at, court: b.court }, nb = { start_at: a.start_at, court: a.court }, w = [...warn({ ...a, ...na }, [a.id, b.id]), ...warn({ ...b, ...nb }, [a.id, b.id])]
    if (w.length && !confirm(`Bentrok: ${w.length} pertandingan akan bertumpuk di lapangan yang sama atau dengan tim yang sama. Tetap lanjutkan?`)) return
    const rs = await Promise.all([supabase.from('matches').update(na).eq('id', a.id), supabase.from('matches').update(nb).eq('id', b.id)]), er = rs.find(r => r.error)
    if (er) alert(er.error.message); else log('Menukar jam pertandingan', `${mname(a)} ⇄ ${mname(b)}`)
    load()
  }
  const dup = async m => {
    const row = { tournament_id: m.tournament_id, court: m.court, round: m.round, start_at: new Date(+new Date(m.start_at) + (m.duration || 60) * 6e4).toISOString(), duration: m.duration || 60, golden: m.golden, best_of: m.best_of, target: m.target, scoring: m.scoring || 'tennis' }
    const { data, error } = await supabase.from('matches').insert(row).select().single()
    if (error) return alert(error.message)
    log('Menggandakan pertandingan', `${mname(m)} (aturan sama, jam berikutnya, tim dikosongkan)`); await load(); pickMatch(data)
  }
  const lock = (m, on) => upd(m, { locked: on }, on ? 'Mengunci pertandingan' : 'Membuka kunci pertandingan', mname(m))
  const lockAll = async () => {
    const list = ms.filter(m => m.status === 'finished' && !m.locked)
    if (!list.length || !confirm(`Kunci ${list.length} pertandingan yang sudah selesai? Hasilnya tidak bisa diubah sampai admin membuka kuncinya.`)) return
    const rs = await Promise.all(list.map(m => supabase.from('matches').update({ locked: true }).eq('id', m.id))), er = rs.find(r => r.error)
    if (er) alert(er.error.message); else log('Mengunci hasil pertandingan', `${list.length} pertandingan`)
    load()
  }
  const walkover = (m, w) => {
    if (!confirm(`Catat walkover? ${tn(w ? m.t2 : m.t1)} menang.`)) return
    upd(m, { status: 'finished', winner: w ? m.team2 : m.team1, wo: true, sets: woSets(m, w), g: [0, 0], p: [0, 0], history: [...m.history.slice(-30), { sets: m.sets, g: m.g, p: m.p }], ...lockOn }, 'Walkover', `${mname(m)}: ${tn(w ? m.t2 : m.t1)} menang`)
    setWob(null)
  }
  const saveNotes = (m, v) => { upd(m, v, 'Mengubah wasit/catatan', mname(m)); setNoting(null) }
  const point = (m, t) => {
    if (m.status !== 'live') return
    const { patch, fin, sc } = pointPatch(m, t, settings.autoLock)
    enqueue(m, patch) // langsung tampil, dikirim di latar belakang
    if (fin) log('Pertandingan selesai', `${mname(m)}: ${sc}`)
  }
  const saveRace = (m, v) => {
    const [a, b] = v.p, hi = Math.max(a, b), done = hi === m.target, w = a > b ? 0 : 1
    if (hi > m.target) return alert(`Pada balapan ke ${m.target}, tidak ada tim yang boleh punya lebih dari ${m.target} poin.`)
    if (done && a === b) return alert('Skor tidak boleh sama di angka target.')
    if (!confirm(done ? `Simpan koreksi skor? ${tn(w ? m.t2 : m.t1)} akan menjadi pemenang.` : 'Simpan koreksi skor? Pertandingan akan berlanjut sebagai live.')) return
    const nx = { ...m, sets: done ? [[a, b]] : [], p: done ? [0, 0] : [a, b], g: [0, 0], status: done ? 'finished' : 'live', wo: false }
    upd(m, { sets: nx.sets, g: [0, 0], p: nx.p, history: [...m.history.slice(-30), { sets: m.sets, g: m.g, p: m.p }], status: nx.status, winner: done ? (w ? m.team2 : m.team1) : null, wo: false, ...(done ? lockOn : {}), ...logAdd(m, { t: null, at: Date.now(), sc: scoreText(nx).replace('*', ''), note: 'Skor dikoreksi' }) },
      'Mengoreksi skor', `${mname(m)}: ${scoreText(m) || '0-0'} → ${scoreText(nx) || '0-0'}`)
    setScoring(null)
  }
  const saveScore = (m, v) => {
    if (v.race) return saveRace(m, v)
    const w = settle(v.sets, m.best_of), done = w !== null
    const msg = done
      ? `Simpan koreksi skor? ${tn(w ? m.t2 : m.t1)} akan menjadi pemenang.${m.status === 'finished' ? ' Bagan yang belum dimainkan akan menyesuaikan otomatis.' : ''}`
      : 'Simpan koreksi skor? Pertandingan akan berlanjut sebagai live.'
    if (!confirm(msg)) return
    const cur = { sets: m.sets, g: m.g, p: m.p }
    const nx = { ...m, sets: v.sets, g: done ? [0, 0] : v.g, status: done ? 'finished' : 'live', wo: false }
    upd(m, { sets: v.sets, g: nx.g, p: done ? [0, 0] : v.p, history: [...m.history.slice(-30), cur], status: nx.status, winner: done ? (w ? m.team2 : m.team1) : null, wo: false, ...(done ? lockOn : {}), ...logAdd(m, { t: null, at: Date.now(), sc: scoreText(nx).replace('*', ''), note: 'Skor dikoreksi' }) },
      'Mengoreksi skor', `${mname(m)}: ${scoreText(m) || '0-0'} → ${scoreText(nx) || '0-0'}`)
    setScoring(null)
  }
  const undo = m => { const u = undoPatch(m); if (u) { enqueue(m, u); log('Membatalkan poin', mname(m)) } }
  const delay = async () => {
    const list = ms.filter(m => m.status === 'scheduled')
    if (!list.length || !confirm(`Mundurkan ${list.length} pertandingan yang belum main sebanyak ${dl} menit?`)) return
    await Promise.all(list.map(m => supabase.from('matches').update({ start_at: new Date(+new Date(m.start_at) + dl * 6e4).toISOString() }).eq('id', m.id)))
    log('Memundurkan jadwal', `${list.length} pertandingan +${dl} menit`); load()
  }
  const save = (m, f) => {
    const v = { team1: f.team1 || null, team2: f.team2 || null, round: f.round, court: f.court, start_at: f.start_at, duration: +f.duration, golden: f.golden, ...fmtRow(f.fmt) }
    if (v.team1 && v.team1 === v.team2) return alert('Pilih dua tim yang berbeda')
    const teamsChanged = v.team1 !== m.team1 || v.team2 !== m.team2
    const changed = teamsChanged || v.best_of !== m.best_of || (v.target || null) !== (m.target || null) || v.scoring !== (m.scoring || 'tennis') || v.golden !== m.golden
    if (m.status !== 'scheduled' && changed) {
      if (!confirm('Mengubah tim atau aturan skor akan mereset skor pertandingan ini. Lanjutkan?')) return
      Object.assign(v, { status: 'scheduled', sets: [], g: [0, 0], p: [0, 0], history: [], winner: null, wo: false, ...logReset(m) })
    }
    // pertandingan bagan yang timnya dipilih tangan: kunci manual supaya tidak ditimpa otomatis
    if ('manual' in m && (m.slot1 || m.slot2) && teamsChanged) v.manual = !!(v.team1 || v.team2)
    if (!ask({ ...m, ...v })) return
    upd(m, v, 'Mengubah pertandingan', `${mname(m)}: ${diff(m, v) || 'aturan'}${v.status === 'scheduled' && m.status !== 'scheduled' ? ' (skor direset)' : ''}`); setEditing(null)
  }
  const autoAgain = m => confirm('Kembalikan ke pengisian otomatis? Tim di pertandingan ini akan dikosongkan lalu diisi lagi dari hasil babak sebelumnya.') && upd(m, { manual: false, team1: null, team2: null }, 'Mengembalikan bagan ke otomatis', mname(m))
  const del = m => confirm(`Hapus pertandingan ${tn(m.t1) || slotText(m.slot1) || TBD} vs ${tn(m.t2) || slotText(m.slot2) || TBD}? Tidak bisa dibatalkan.`) && run(supabase.from('matches').delete().eq('id', m.id), 'Menghapus pertandingan', mname(m)).then(() => setEditing(null))
  const pickMatch = m => { setEditing(m.id); setTimeout(() => document.getElementById('m-' + m.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50) }

  const hist = view === 'matchhist'
  const [flt, setFlt] = useState(hist ? 'done' : 'all')
  const shown = ms.filter(m => flt === 'all' || (flt === 'live' ? m.status === 'live' : flt === 'todo' ? m.status === 'scheduled' : m.status === 'finished'))
  const cnt = { all: ms.length, live: ms.filter(m => m.status === 'live').length, todo: ms.filter(m => m.status === 'scheduled').length, done: ms.filter(m => m.status === 'finished').length }
  // dari halaman Bagan: buka pertandingan itu untuk diubah
  useEffect(() => { if (view === 'control' && focusId) { const m = ms.find(x => x.id === focusId); if (m) { pickMatch(m); onFocus && onFocus(null) } } }, [view, focusId, ms.length])

  if (view === 'fixtures') return <>
    <FixtureGenerator tm={tm} ms={ms} tid={tid} courts={courts} settings={settings} load={load} />
    <div className="panel"><h3>Tambah satu pertandingan</h3><p className="muted">Untuk pertandingan tambahan. Pilih dua tim, lapangan, dan jam mulai.</p>
      <form className="fm" onSubmit={add}>
        {['team1', 'team2'].map(k => <select key={k} required value={mf[k]} onChange={e => setMf({ ...mf, [k]: e.target.value })}>
          <option value="">{k === 'team1' ? 'Tim A' : 'Tim B'}</option>{tm.map(t => <option key={t.id} value={t.id}>{tn(t)}</option>)}</select>)}
        <select value={mf.round} onChange={e => setMf({ ...mf, round: e.target.value })}>{ROUNDS.map(r => <option key={r} value={r}>{roundName(r)}</option>)}</select>
        <CourtSelect value={mf.court} courts={courts} onChange={v => setMf({ ...mf, court: v })} />
        <select value={mf.fmt} onChange={e => setMf({ ...mf, fmt: e.target.value })}>{fmtOptions(mf.fmt).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        {FORMATS[mf.fmt].scoring !== 'race' && <select value={mf.golden} onChange={e => setMf({ ...mf, golden: e.target.value === 'true' })}><option value="true">Golden point</option><option value="false">Advantage</option></select>}
        <select value={mf.duration} onChange={e => setMf({ ...mf, duration: e.target.value })}>{[...new Set([...DURS, +mf.duration].filter(Boolean))].sort((a, b) => a - b).map(x => <option key={x} value={x}>{x} menit</option>)}</select>
        <div className="full"><DT value={mf.start_at} onChange={v => setMf({ ...mf, start_at: v })} /></div>
        <button className="btn">Jadwalkan pertandingan</button>
      </form></div>
    <div className="panel"><h3>Babak gugur (semifinal, final, dst.)</h3>
      <p className="muted">Bagan babak gugur dibuat di halaman <b>Bagan</b>: bisa diacak otomatis, diatur manual, atau diambil dari klasemen grup. Pemenang otomatis maju ke babak berikutnya.</p>
      <div className="ctrl"><button className="btn" onClick={() => go('bracket')}>Buka halaman Bagan</button></div></div>
    <BulkDelete ms={ms} tid={tid} run={run} view={view} />
  </>

  if (view === 'timetable') return <>
    <Reorder ms={ms} courts={courts} edit={edit} swap={swap} />
    <div className="panel"><h3>Aksi massal</h3><p className="muted">Dipakai saat hujan atau pertandingan molor: mundurkan semua pertandingan yang belum main sekaligus, atau kunci semua hasil agar tidak berubah tanpa sengaja.</p>
      <div className="fm"><select value={dl} onChange={e => setDl(+e.target.value)}>{[15, 30, 45, 60].map(x => <option key={x} value={x}>Mundur {x} menit</option>)}</select>
        <button className="btn o" onClick={delay}>Mundurkan semua yang belum main</button>
        <button className="btn o" onClick={lockAll}>Kunci semua hasil selesai</button></div></div>
  </>

  return <>
    {hist && <div className="panel"><h3>Riwayat pertandingan</h3><p className="muted">Semua pertandingan yang sudah selesai di kategori ini. Pilih <b>Ubah skor</b> untuk mengoreksi hasil, <b>Ubah</b> untuk mengganti tim/jam/lapangan, <b>Reset</b> untuk memainkan ulang, atau <b>Hapus</b> untuk membuang dari riwayat. Hasil yang terkunci perlu <b>Buka kunci</b> dulu sebelum diubah.</p></div>}
    {!hist && <div className="chips">{[['all', 'Semua'], ['live', 'Live'], ['todo', 'Akan datang'], ['done', 'Selesai']].map(([k, l]) =>
      <button key={k} className={flt === k ? 'on' : ''} onClick={() => setFlt(k)}>{l} <span>{cnt[k]}</span></button>)}</div>}
    <div className="grid">{shown.map(m => <div key={m.id} id={'m-' + m.id}><Card m={m} plain>
      {m.manual && <div className="mnote"><span className="chip">✋ Tim dipilih manual</span>{admin && m.status === 'scheduled' && <button className="link" onClick={() => autoAgain(m)}>Kembalikan otomatis</button>}</div>}
      {editing === m.id ? <EditForm m={m} tm={tm} courts={courts} onSave={f => save(m, f)} onCancel={() => setEditing(null)} onDelete={() => del(m)} /> :
        scoring === m.id ? <ScoreEdit m={m} onSave={v => saveScore(m, v)} onCancel={() => setScoring(null)} /> :
        wob === m.id ? <WalkoverBox m={m} onSave={w => walkover(m, w)} onCancel={() => setWob(null)} /> :
        noting === m.id ? <NoteBox m={m} onSave={v => saveNotes(m, v)} onCancel={() => setNoting(null)} /> :
        m.locked ? <div className="ctrl"><span className="chip lock">🔒 Terkunci</span>
          {admin && <button className="btn o sm" onClick={() => lock(m, false)}>Buka kunci</button>}
          {admin && <button className="btn o sm" onClick={() => dup(m)}>Gandakan</button>}
          {admin && <button className="btn o sm danger" onClick={() => del(m)}>Hapus</button>}</div> :
        <div className="ctrl">
          {m.status === 'scheduled' && <button className="btn sm" onClick={() => { enqueue(m, { status: 'live' }); log('Memulai pertandingan', mname(m)) }} disabled={!m.team1 || !m.team2}>Mulai pertandingan</button>}
          {m.status === 'live' && <>
            <button className="btn sm" onClick={() => point(m, 0)}>+ {tn(m.t1)}</button>
            <button className="btn sm" onClick={() => point(m, 1)}>+ {tn(m.t2)}</button>
            <button className="btn o sm" onClick={() => undo(m)}>Batalkan poin</button></>}
          {m.status !== 'scheduled' && <button className="btn o sm" onClick={() => setScoring(m.id)}>Ubah skor</button>}
          {m.status !== 'finished' && <button className="btn o sm" disabled={!m.team1 || !m.team2} onClick={() => setWob(m.id)}>Walkover</button>}
          <button className="btn o sm" onClick={() => setNoting(m.id)}>Catatan</button>
          {admin && m.status === 'finished' && <button className="btn o sm" onClick={() => lock(m, true)}>Kunci hasil</button>}
          {admin && <button className="btn o sm" onClick={() => setEditing(m.id)}>Ubah</button>}
          {admin && <button className="btn o sm" onClick={() => dup(m)}>Gandakan</button>}
          {admin && m.status !== 'scheduled' && <button className="btn o sm" onClick={() => confirm('Reset pertandingan ini? Skornya akan dikosongkan.') && upd(m, { status: 'scheduled', sets: [], g: [0, 0], p: [0, 0], history: [], winner: null, wo: false, ...logReset(m) }, 'Mereset pertandingan', mname(m))}>Reset</button>}
          {admin && <button className="btn o sm danger" onClick={() => del(m)}>Hapus</button>}
        </div>}
    </Card></div>)}</div>
    {!shown.length && <div className="empty">{ms.length ? (hist ? 'Belum ada pertandingan selesai.' : 'Tidak ada pertandingan di tampilan ini.') : 'Belum ada pertandingan.'}{admin && !ms.length && <button className="btn" onClick={() => go('fixtures')}>Buat pertandingan</button>}</div>}
    {admin && ms.length > 0 && <BulkDelete ms={ms} tid={tid} run={run} view={view} />}
  </>
}
