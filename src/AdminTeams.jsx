import { useMemo, useState } from 'react'
import { supabase } from './supabase'
import { readXlsx, teamTemplate } from './xlsx'
import { parseTeamRows, tn, GENDERS, genderLabel, LEVELS, tourSub } from './util'
import { log } from './AdminExtra'
import { woSets, DrawGroups } from './AdminTools'

export const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
const dl = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000) }

// Impor tim dari file Excel (.xlsx) memakai template
function ImportTeams({ tm, tid, run }) {
  const [open, setOpen] = useState(false), [data, setData] = useState(null), [fname, setFname] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const key = r => [r.player1, r.player2].map(x => x.trim().toLowerCase()).sort().join('|')
  const res = useMemo(() => {
    if (!data) return null
    const { rows, errors } = parseTeamRows(data), have = new Set(tm.map(key)), fresh = [], dup = []
    rows.forEach(r => { if (have.has(key(r))) dup.push(r); else { have.add(key(r)); fresh.push(r) } })
    return { fresh, dup, errors }
  }, [data, tm])
  const pick = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return
    setErr(''); setData(null)
    if (!/\.xlsx$/i.test(f.name)) return setErr('Gunakan file Excel berformat .xlsx. Unduh template di bawah, isi, lalu simpan sebagai .xlsx.')
    try { setData(await readXlsx(await f.arrayBuffer())); setFname(f.name) } catch (x) { setErr(x.message || 'File tidak bisa dibaca') }
  }
  const go = async () => {
    setBusy(true)
    const ok = await run(supabase.from('teams').insert(res.fresh.map(r => ({ ...r, tournament_id: tid }))), 'Mengimpor tim', `${res.fresh.length} tim dari ${fname}`)
    setBusy(false)
    if (ok) { setData(null); setOpen(false) }
  }
  return <div className="imp">
    <button className="btn o sm" onClick={() => setOpen(!open)}>{open ? 'Tutup impor' : 'Impor tim dari Excel'}</button>
    {open && <div className="editbox">
      <ol className="steps"><li>Unduh template Excel.</li><li>Isi satu tim per baris: <b>Pemain 1, Pemain 2, Nama Tim (opsional), Grup</b>.</li><li>Simpan sebagai <b>.xlsx</b>, lalu unggah di sini.</li></ol>
      <div className="ctrl">
        <button className="btn o sm" onClick={async () => dl(teamTemplate(), 'template-impor-tim.xlsx')}>1. Unduh template Excel</button>
        <label className="btn sm">2. Pilih file Excel (.xlsx)<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={pick} /></label>
      </div>
      {err && <p className="err">{err}</p>}
      {res && <div className="imps">
        <p><b>{res.fresh.length}</b> tim siap diimpor dari <b>{fname}</b>{res.dup.length > 0 && <> · <b>{res.dup.length}</b> dilewati (sudah ada)</>}{res.errors.length > 0 && <> · <b>{res.errors.length}</b> baris bermasalah</>}</p>
        {res.errors.length > 0 && <ul className="errs">{res.errors.slice(0, 8).map(x => <li key={x}>{x}</li>)}{res.errors.length > 8 && <li>…dan {res.errors.length - 8} lainnya</li>}</ul>}
        {res.fresh.length > 0 && <div className="scroll"><table className="tb left"><tbody>{res.fresh.slice(0, 40).map((r, i) => <tr key={i}><td><b>{r.name}</b></td><td>{r.player1} / {r.player2}</td><td>Grup {r.grp}</td></tr>)}</tbody></table></div>}
        {res.fresh.length > 40 && <p className="muted">Menampilkan 40 dari {res.fresh.length} tim.</p>}
        <div className="ctrl"><button className="btn sm" disabled={!res.fresh.length || busy} onClick={go}>{busy ? 'Mengimpor…' : `Impor ${res.fresh.length} tim`}</button></div>
      </div>}
    </div>}
  </div>
}

export function Teams({ tm, ms = [], tid, run, load, settings }) {
  const blank = { name: '', player1: '', player2: '', grp: 'A' }, [tf, setTf] = useState(blank)
  const [eid, setEid] = useState(null), [ef, setEf] = useState(blank)
  const set = k => e => setTf({ ...tf, [k]: e.target.value })
  const eset = k => e => setEf({ ...ef, [k]: e.target.value })
  const others = (p1, p2, skip) => tm.filter(x => x.id !== skip && [p1, p2].some(n => [x.player1, x.player2].some(y => y.trim().toLowerCase() === n.trim().toLowerCase())))
  const withdraw = async t => {
    const list = ms.filter(m => m.status !== 'finished' && !m.locked && m.team1 && m.team2 && (m.team1 === t.id || m.team2 === t.id))
    if (!list.length) return alert(`${tn(t)} tidak punya pertandingan yang belum dimainkan dengan lawan yang sudah pasti.`)
    if (!confirm(`Tim ${tn(t)} mengundurkan diri? ${list.length} pertandingan yang belum dimainkan akan dicatat sebagai kemenangan walkover untuk lawannya. Tim tidak dihapus.`)) return
    const rs = await Promise.all(list.map(m => { const w = m.team1 === t.id ? 1 : 0
      return supabase.from('matches').update({ status: 'finished', winner: w ? m.team2 : m.team1, wo: true, sets: woSets(m, w), g: [0, 0], p: [0, 0], history: [...(m.history || []).slice(-30), { sets: m.sets, g: m.g, p: m.p }], ...(settings.autoLock ? { locked: true } : {}) }).eq('id', m.id) })), er = rs.find(r => r.error)
    if (er) alert(er.error.message); else log('Tim mengundurkan diri', `${tn(t)}: ${list.length} walkover`)
    load()
  }
  const startEdit = t => { setEid(t.id); setEf({ name: t.name || '', player1: t.player1, player2: t.player2, grp: t.grp || 'A' }) }
  const nm = f => f.name.trim() || `${f.player1.trim()} x ${f.player2.trim()}`
  const saveEdit = t => {
    if (!ef.player1.trim() || !ef.player2.trim()) return alert('Nama kedua pemain wajib diisi')
    run(supabase.from('teams').update({ name: nm(ef), player1: ef.player1.trim(), player2: ef.player2.trim(), grp: ef.grp }).eq('id', t.id), 'Mengubah tim', nm(ef)).then(() => setEid(null))
  }
  const delAll = () => {
    if (!tm.length) return alert('Belum ada tim di kategori ini.')
    if (confirm(`Hapus SEMUA ${tm.length} tim di kategori ini?\n\nSemua pertandingan yang melibatkan tim tersebut ikut terhapus. Tidak bisa dibatalkan.`))
      run(supabase.from('teams').delete().eq('tournament_id', tid), 'Menghapus semua tim', `${tm.length} tim`)
  }
  return <div className="panel"><h3>Tim & pemain</h3>
    <p className="muted">Tambah satu per satu, atau impor banyak tim sekaligus dari Excel. Setelah semua tim masuk, gunakan <b>Acak grup</b> untuk membagi grup.</p>
    <form className="fm" onSubmit={e => { e.preventDefault(); const dupP = others(tf.player1, tf.player2); if (dupP.length && !confirm(`Pemain dengan nama yang sama sudah ada di ${dupP.map(tn).join(', ')}. Tetap tambahkan tim ini?`)) return; run(supabase.from('teams').insert({ ...tf, name: nm(tf), tournament_id: tid }), 'Menambah tim', nm(tf)); setTf(blank) }}>
      <input required placeholder="Pemain 1" value={tf.player1} onChange={set('player1')} />
      <input required placeholder="Pemain 2" value={tf.player2} onChange={set('player2')} />
      <input placeholder="Nama tim (opsional)" value={tf.name} onChange={set('name')} />
      <select value={tf.grp} onChange={set('grp')}>{GROUPS.map(g => <option key={g} value={g}>Grup {g}</option>)}</select>
      <button className="btn">Tambah tim</button>
    </form>
    <ImportTeams tm={tm} tid={tid} run={run} />
    <DrawGroups tm={tm} ms={ms} load={load} />
    <div className="items">{tm.map(t => eid === t.id
      ? <div className="item editing" key={t.id}>
        <div className="fm">
          <input placeholder="Nama tim" value={ef.name} onChange={eset('name')} />
          <input placeholder="Pemain 1" value={ef.player1} onChange={eset('player1')} />
          <input placeholder="Pemain 2" value={ef.player2} onChange={eset('player2')} />
          <select value={ef.grp} onChange={eset('grp')}>{[...new Set([...GROUPS, ef.grp])].map(g => <option key={g} value={g}>Grup {g}</option>)}</select>
        </div>
        <div className="ctrl"><button className="btn sm" onClick={() => saveEdit(t)}>Simpan</button><button className="btn o sm" onClick={() => setEid(null)}>Batal</button></div>
      </div>
      : <div className="item" key={t.id}>
        <div className="im"><b>{tn(t)}</b><small>{t.player1} / {t.player2}</small></div>
        <span className="chip">Grup {t.grp}</span>
        <div className="ia"><button className="btn o sm" onClick={() => startEdit(t)}>Ubah</button>
          <button className="btn o sm" onClick={() => withdraw(t)}>Mundur</button>
          <button className="btn o sm danger" onClick={() => confirm(`Hapus tim ${tn(t)} beserta pertandingannya?`) && run(supabase.from('teams').delete().eq('id', t.id), 'Menghapus tim', tn(t))}>Hapus</button></div>
      </div>)}</div>
    {!tm.length && <p className="muted">Belum ada tim. Tambahkan lewat form di atas atau impor dari Excel.</p>}
    {tm.length > 0 && <div className="ctrl"><button className="btn o sm danger" onClick={delAll}>Hapus semua tim di kategori ini ({tm.length})</button></div>}
  </div>
}

// Kategori turnamen: dibuat dan dihapus bebas oleh admin (mis. Bronze, Beginner, Amatir, Veteran)
export function Categories({ tours, teams = [], matches = [], run }) {
  const blank = { name: '', gender: 'Men', level: '', start_date: '' }, [f, setF] = useState(blank)
  const [eid, setEid] = useState(null), [ef, setEf] = useState(blank)
  const set = k => e => setF({ ...f, [k]: e.target.value })
  const eset = k => e => setEf({ ...ef, [k]: e.target.value })
  const sugg = [...new Set([...LEVELS, ...tours.map(t => t.level).filter(Boolean)])]
  const row = x => ({ name: x.name.trim(), gender: x.gender, level: x.level.trim(), start_date: x.start_date || null })
  const startEdit = t => { setEid(t.id); setEf({ name: t.name, gender: t.gender, level: t.level || '', start_date: t.start_date || '' }) }
  const saveEdit = t => {
    if (!ef.name.trim()) return alert('Nama kategori wajib diisi')
    run(supabase.from('tournaments').update(row(ef)).eq('id', t.id), 'Mengubah kategori', ef.name.trim()).then(() => setEid(null))
  }
  const del = t => {
    const nt = teams.filter(x => x.tournament_id === t.id).length, nm = matches.filter(x => x.tournament_id === t.id).length
    if (confirm(`Hapus kategori "${t.name}"?\n\nIkut terhapus: ${nt} tim dan ${nm} pertandingan. Tidak bisa dibatalkan.`)) run(supabase.from('tournaments').delete().eq('id', t.id), 'Menghapus kategori', t.name)
  }
  const fields = (v, fn) => <>
    <input required className="wide" placeholder="Nama kategori, mis. AMATIR atau BEGINNER PUTRA" value={v.name} onChange={fn('name')} />
    <select value={v.gender} onChange={fn('gender')} aria-label="Jenis">{GENDERS.map(x => <option key={x} value={x}>{genderLabel(x)}</option>)}</select>
    <input list="lvls" placeholder="Tingkat (opsional), mis. Amatir" value={v.level} onChange={fn('level')} />
    <input type="date" value={v.start_date} onChange={fn('start_date')} aria-label="Tanggal mulai" />
  </>
  return <div className="panel"><h3>Kategori turnamen</h3>
    <p className="muted">Kategori adalah kelompok peserta yang bertanding sendiri, misalnya <b>Bronze Putra</b>, <b>Beginner</b>, atau <b>Amatir</b>. Buat sebanyak yang kamu mau dengan nama bebas, dan hapus kapan saja. Setiap kategori punya tim, jadwal, dan bagan sendiri.</p>
    <datalist id="lvls">{sugg.map(x => <option key={x} value={x} />)}</datalist>
    <form className="fm" onSubmit={e => { e.preventDefault(); run(supabase.from('tournaments').insert(row(f)), 'Membuat kategori', f.name.trim()); setF(blank) }}>
      {fields(f, set)}<button className="btn">Tambah kategori</button>
    </form>
    <div className="items">{tours.map(t => eid === t.id
      ? <div className="item editing" key={t.id}>
        <div className="fm">{fields(ef, eset)}</div>
        <div className="ctrl"><button className="btn sm" onClick={() => saveEdit(t)}>Simpan</button><button className="btn o sm" onClick={() => setEid(null)}>Batal</button></div>
      </div>
      : <div className="item" key={t.id}>
        <div className="im"><b>{t.name}</b><small>{tourSub(t)}{t.start_date ? ' · ' + t.start_date : ''} · {teams.filter(x => x.tournament_id === t.id).length} tim · {matches.filter(x => x.tournament_id === t.id).length} pertandingan</small></div>
        <div className="ia"><button className="btn o sm" onClick={() => startEdit(t)}>Ubah</button>
          <button className="btn o sm danger" onClick={() => del(t)}>Hapus</button></div>
      </div>)}</div>
    {!tours.length && <p className="muted">Belum ada kategori. Buat yang pertama lewat form di atas.</p>}
  </div>
}
