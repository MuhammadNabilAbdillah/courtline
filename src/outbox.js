import { useSyncExternalStore } from 'react'
import { supabase } from './supabase'

// Offline outbox for live scoring. A tap on "+1" is applied on the scorer's phone at once and saved in the phone's storage,
// then sent in the background. If the signal drops, nothing is lost: it is sent automatically when the signal returns.
// Each queued entry is the newest full score state of a match, so sending is safe to repeat and keeps the right order.
const KEY = 'cl-outbox'
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {} } catch { return {} } }
let q = read(), busy = false, err = '', timer = null, hook = null, snap
const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(q)) } catch { /* private mode */ } }
const build = () => ({ items: { ...q }, matches: Object.keys(q).length, ops: Object.values(q).reduce((a, x) => a + (x.ops || 0), 0), busy, err })
snap = build()
const subs = new Set()
const emit = () => { snap = build(); subs.forEach(f => f()) }
export const useOutbox = () => useSyncExternalStore(f => { subs.add(f); return () => subs.delete(f) }, () => snap)
export const setSyncHook = f => { hook = f }
export const dismissError = () => { err = ''; emit() }

// network problems and expired sessions are retried; real database refusals (locked match, no permission) are not
const retryable = e => !e || e.status === 0 || !e.code || /fetch|network|load failed|timeout|jwt|expired|offline/i.test(e.message || '')
const schedule = ms => { if (timer) clearTimeout(timer); timer = setTimeout(() => { timer = null; flush() }, ms) }

async function send(id, patch) {
  let r = await supabase.from('matches').update(patch).eq('id', id).select('id')
  if (r.error && 'points' in patch && /points/i.test(r.error.message) && /column|schema cache/i.test(r.error.message)) {
    const { points, ...rest } = patch // eslint-disable-line no-unused-vars
    r = await supabase.from('matches').update(rest).eq('id', id).select('id')
  }
  return r
}

export async function flush() {
  if (busy || !Object.keys(q).length) return
  busy = true; emit()
  let retry = false
  try {
    for (const id of Object.keys(q)) {
      const it = q[id]; if (!it) continue
      const v = it.v
      let r
      try { r = await send(id, it.patch) } catch (x) { r = { error: { message: String(x && x.message), status: 0 } } }
      if (r.error && retryable(r.error)) { retry = true; break }
      if (r.error) { err = `${it.name}: ${r.error.message}`; delete q[id]; continue }
      if (!r.data || !r.data.length) { err = `${it.name}: could not be saved (no permission, or the match was removed)`; delete q[id]; continue }
      if (hook) { try { await hook() } catch { /* refresh failed: the change is already saved */ } } // reload first, so the score never flickers back to the old value
      if (q[id] && q[id].v === v) delete q[id] // a newer change that arrived while sending stays queued
    }
  } catch { retry = true }
  busy = false; keep(); emit()
  if (Object.keys(q).length) schedule(retry ? 4000 : 200)
}

// Queue a change for one match. `m` is the match as shown on screen, `patch` the columns to write.
export function enqueue(m, patch, ops = 1) {
  const cur = q[m.id], nm = x => `${(x.t1 && (x.t1.name || x.t1.player1)) || x.slot1 || 'TBD'} vs ${(x.t2 && (x.t2.name || x.t2.player1)) || x.slot2 || 'TBD'}`
  q[m.id] = { patch: { ...(cur ? cur.patch : {}), ...patch }, ops: (cur ? cur.ops : 0) + ops, name: nm(m), v: (cur ? cur.v : 0) + 1 }
  err = ''; keep(); emit(); flush()
}

// Matches as the scorer's phone sees them: server data with the not-yet-sent changes on top
export const overlay = (ms, items) => (Object.keys(items).length ? ms.map(m => (items[m.id] ? { ...m, ...items[m.id].patch } : m)) : ms)

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => flush())
  document.addEventListener('visibilitychange', () => { if (!document.hidden) flush() })
  setInterval(() => { if (Object.keys(q).length) flush() }, 6000)
  if (Object.keys(q).length) schedule(1500)
}
