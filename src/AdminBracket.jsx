import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { BracketView } from './Bracket'
import { DT } from './AdminTools'
import { log } from './AdminExtra'
import { bracketSize, placeSeeds, shuffleSlots, groupSeeds, planBracket, scheduleBracket } from './bracketPlan'
import { FORMATS, fmtOptions, fmtRow, tn, tourLabel } from './util'

const roundOfSize = n => ({ 2: 'Final', 4: 'Semifinal', 8: 'Perempat final', 16: '16 besar' }[n] || '')

// Halaman Bagan: lihat bagan yang ada, atau susun yang baru (acak / manual / dari klasemen grup)
export function BracketPage({ tour, tm, ms, tid, courts, settings, run, load, onFocus }) {
  const ko = ms.filter(m => m.round !== 'Group Stage'), hasKO = ko.length > 0, played = ko.filter(m => m.status !== 'scheduled').length
  const [building, setBuilding] = useState(!hasKO)
  useEffect(() => { setBuilding(!ko.length) }, [tid]) // eslint-disable-line react-hooks/exhaustive-deps

  const wipe = async () => {
    if (!confirm(`Hapus seluruh bagan babak gugur${played ? ` beserta ${played} hasil yang sudah dimainkan` : ''}? Pertandingan babak grup tidak ikut terhapus.`)) return
    if (await run(supabase.from('matches').delete().eq('tournament_id', tid).neq('round', 'Group Stage'), 'Menghapus bagan', tour ? tour.name : '')) setBuilding(true)
  }
  return <>
    <div className="panel"><h3>Cara kerja bagan</h3>
      <ol className="steps"><li>Pilih cara menyusun: <b>acak otomatis</b>, <b>atur manual</b>, atau <b>ambil dari klasemen grup</b>.</li><li>Lihat pratinjau bagan, lalu tekan <b>Buat bagan</b>.</li><li>Saat pertandingan selesai, <b>pemenang otomatis maju</b> ke semifinal dan final. Jika skor dikoreksi, babak berikutnya yang belum dimulai ikut menyesuaikan.</li></ol></div>
    {hasKO && <div className="panel"><div className="ph"><h3>Bagan saat ini</h3><span className="chip">{ko.length} pertandingan{played ? ` · ${played} sudah main` : ''}</span></div>
      <BracketView matches={ms} onPick={m => onFocus(m.id)} title={tour ? tourLabel(tour) : 'Bagan'} note="Ketuk pertandingan untuk mengubah tim, jam, atau skor." />
      <div className="ctrl">
        <button className="btn o sm" onClick={() => setBuilding(!building)}>{building ? 'Tutup pengaturan' : 'Susun ulang / acak ulang bagan'}</button>
        <button className="btn o sm danger" onClick={wipe}>Hapus bagan</button>
      </div></div>}
    {building && <Builder key={tid + ':' + ko.length} {...{ tour, tm, ms, tid, courts, settings, run, load, hasKO, played, onDone: () => setBuilding(false) }} />}
  </>
}

function Builder({ tour, tm, ms, tid, courts, settings, load, hasKO, played, onDone }) {
  const groups = useMemo(() => [...new Set(tm.map(t => t.grp))].sort(), [tm])
  const [mode, setMode] = useState(groups.length > 1 && tm.length > 6 ? 'groups' : 'teams'), [picked, setPicked] = useState(() => tm.map(t => t.id)), [q, setQ] = useState(2), [third, setThird] = useState(true)
  const [slots, setSlots] = useState([]), [busy, setBusy] = useState(false)
  const [f, setF] = useState(() => {
    const d = new Date(Math.max(Date.now(), ...ms.filter(m => m.round === 'Group Stage').map(m => +new Date(m.start_at))) + 45 * 6e4); d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0)
    return { start_at: d.toISOString(), len: settings.duration || 30, fmt: settings.fmt, courts: courts.slice(0, 2).length ? courts.slice(0, 2) : courts }
  })
  const order = tm.filter(t => picked.includes(t.id)), tmap = Object.fromEntries(tm.map(t => [t.id, t]))
  const size = bracketSize(Math.max(2, order.length)), key = order.map(t => t.id).join(',')
  useEffect(() => { if (mode === 'teams') setSlots(placeSeeds(order.map(t => ({ team: t.id })), size)) }, [key, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  const total = groups.length * q, gsize = bracketSize(Math.max(2, total))
  const groupSlots = useMemo(() => placeSeeds(groupSeeds(groups, q), gsize), [groups, q, gsize])
  const active = mode === 'teams' ? slots : groupSlots
  const used = active.filter(s => s && s.team).map(s => s.team), dupes = used.length !== new Set(used).size
  const nTeams = mode === 'teams' ? used.length : total
  const tooMany = (mode === 'teams' ? order.length : total) > 16
  const plan = useMemo(() => active.length >= 2 ? planBracket(active, { third }) : [], [active, third])
  const F = FORMATS[f.fmt] || FORMATS.race6
  const preview = plan.map(p => ({ id: 'v-' + p.code, ...p, t1: tmap[p.team1] || null, t2: tmap[p.team2] || null, sets: [], g: [0, 0], p: [0, 0], status: 'scheduled', best_of: F.best_of, target: F.target, scoring: F.scoring, virtual: true }))
  const err = tooMany ? 'Maksimal 16 tim di bagan babak gugur.' : nTeams < 2 ? 'Pilih minimal 2 tim.' : dupes ? 'Ada tim yang dipilih dua kali.' : !f.courts.length ? 'Pilih minimal satu lapangan.' : ''

  const setSlot = (i, v) => setSlots(slots.map((s, k) => k === i ? (v ? { team: v } : null) : s))
  const shuffle = () => setSlots(shuffleSlots(order.map(t => ({ team: t.id })), size))
  const inOrder = () => setSlots(placeSeeds(order.map(t => ({ team: t.id })), size))
  const clear = () => setSlots(Array(size).fill(null))

  const create = async () => {
    const rows = scheduleBracket(plan, { start: +new Date(f.start_at), len: +f.len, gap: 10, courts: f.courts })
      .map(m => ({ tournament_id: tid, code: m.code, round: m.round, team1: m.team1, team2: m.team2, slot1: m.slot1, slot2: m.slot2, court: m.court, start_at: new Date(m.at).toISOString(), duration: +f.len, golden: settings.golden, ...fmtRow(f.fmt) }))
    if (!confirm(`${hasKO ? 'Bagan lama' + (played ? ` beserta ${played} hasilnya` : '') + ' akan diganti. ' : ''}Buat ${rows.length} pertandingan babak gugur?`)) return
    setBusy(true)
    if (hasKO) { const d = await supabase.from('matches').delete().eq('tournament_id', tid).neq('round', 'Group Stage'); if (d.error) { setBusy(false); return alert(d.error.message) } }
    const r = await supabase.from('matches').insert(rows)
    setBusy(false)
    if (r.error) { alert(r.error.message); load(); return }
    log(hasKO ? 'Menyusun ulang bagan' : 'Membuat bagan', `${tour ? tour.name : ''}: ${rows.length} pertandingan, ${mode === 'groups' ? `${q} teratas tiap grup` : `${nTeams} tim`}`)
    await load(); onDone()
  }

  const pairs = Array.from({ length: slots.length / 2 }, (_, j) => j)
  return <div className="panel"><h3>{hasKO ? 'Susun ulang bagan' : 'Buat bagan babak gugur'}</h3>
    {hasKO && <p className="warnline">⚠ Bagan lama akan dihapus dan diganti dengan yang baru{played ? `, termasuk ${played} hasil yang sudah dimainkan` : ''}.</p>}
    <div className="seg" role="tablist">
      <button className={mode === 'teams' ? 'on' : ''} onClick={() => setMode('teams')}><b>Pilih tim: acak atau manual</b><small>Acak otomatis, lalu boleh diubah tangan</small></button>
      <button className={mode === 'groups' ? 'on' : ''} onClick={() => setMode('groups')} disabled={groups.length < 1 || !tm.length}><b>Dari klasemen grup</b><small>Yang lolos terisi otomatis saat grup selesai</small></button>
    </div>

    {mode === 'teams' && <>
      <h4 className="sub-h">1. Tim yang ikut bagan ({order.length})</h4>
      <div className="ctrl"><button className="btn o sm" onClick={() => setPicked(tm.map(t => t.id))}>Pilih semua</button><button className="btn o sm" onClick={() => setPicked([])}>Kosongkan</button></div>
      <div className="pick">{tm.map(t => <label key={t.id} className="chk"><input type="checkbox" checked={picked.includes(t.id)} onChange={e => setPicked(e.target.checked ? [...picked, t.id] : picked.filter(x => x !== t.id))} /> {tn(t)} <small className="muted">Grup {t.grp}</small></label>)}</div>
      {!tm.length && <p className="muted">Belum ada tim di kategori ini. Tambahkan dulu di halaman Tim.</p>}
      {order.length >= 2 && <>
        <h4 className="sub-h">2. Susunan pertandingan pertama</h4>
        <div className="ctrl"><button className="btn sm" onClick={shuffle}>🔀 Acak susunan</button><button className="btn o sm" onClick={inOrder}>Urut sesuai daftar tim</button><button className="btn o sm" onClick={clear}>Kosongkan semua</button></div>
        <p className="muted">Pilih tim di setiap kotak untuk mengatur manual. Kotak kosong = lawannya lolos langsung (bye).{order.length !== size && ` Dengan ${order.length} tim, bagan berukuran ${size}, jadi ${size - order.length} tim mendapat bye.`}</p>
        <div className="pairs">{pairs.map(j => <div className="pair" key={j}><span className="pn">{roundOfSize(size)} {j + 1}</span>
          {[2 * j, 2 * j + 1].map(i => <select key={i} value={slots[i] ? slots[i].team : ''} onChange={e => setSlot(i, e.target.value)}>
            <option value="">— kosong / bye —</option>{order.filter(t => t.id === (slots[i] && slots[i].team) || !used.includes(t.id)).map(t => <option key={t.id} value={t.id}>{tn(t)}</option>)}</select>)}</div>)}</div>
      </>}
    </>}

    {mode === 'groups' && <>
      <h4 className="sub-h">1. Berapa tim yang lolos dari tiap grup?</h4>
      <div className="fm"><select value={q} onChange={e => setQ(+e.target.value)}>{[1, 2, 3, 4].map(x => <option key={x} value={x}>{x} teratas tiap grup</option>)}</select></div>
      <p className="muted">{groups.length} grup ({groups.join(', ')}) × {q} = <b>{total}</b> tim lolos. Susunan disilang otomatis supaya satu grup tidak langsung bertemu di awal. Tim akan terisi sendiri saat semua pertandingan grupnya selesai.</p>
    </>}

    <h4 className="sub-h">{mode === 'teams' ? '3' : '2'}. Pratinjau bagan</h4>
    {preview.length > 0 && nTeams >= 2 ? <BracketView matches={preview} virtual note="Pratinjau — belum disimpan" title={tour ? tour.name : 'Bagan'} /> : <div className="empty">Pilih minimal 2 tim untuk melihat pratinjau.</div>}

    <h4 className="sub-h">{mode === 'teams' ? '4' : '3'}. Aturan & jadwal</h4>
    <div className="fm">
      <label className="fl">Format skor<select value={f.fmt} onChange={e => setF({ ...f, fmt: e.target.value })}>{fmtOptions(f.fmt).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="fl">Menit per pertandingan<select value={f.len} onChange={e => setF({ ...f, len: +e.target.value })}>{[15, 20, 25, 30, 40, 45, 60].map(x => <option key={x} value={x}>{x} menit</option>)}</select></label>
      <div className="full"><label className="fl">Mulai babak pertama<DT value={f.start_at} onChange={v => setF({ ...f, start_at: v })} /></label></div>
      <div className="full"><small className="muted">Lapangan yang dipakai</small><div className="ctrl">{courts.map(c => <label key={c} className="chk"><input type="checkbox" checked={f.courts.includes(c)} onChange={e => setF({ ...f, courts: e.target.checked ? [...f.courts, c] : f.courts.filter(x => x !== c) })} /> {c}</label>)}</div></div>
      <label className="chk full"><input type="checkbox" checked={third} onChange={e => setThird(e.target.checked)} /> Buat juga perebutan juara 3 (jika ada dua semifinal)</label>
    </div>
    {err && <p className="err">{err}</p>}
    <div className="ctrl"><button className="btn" disabled={!!err || busy || !plan.length} onClick={create}>{busy ? 'Menyimpan…' : `Buat bagan (${plan.length} pertandingan)`}</button>{hasKO && <button className="btn o" onClick={onDone}>Batal</button>}</div>
  </div>
}
