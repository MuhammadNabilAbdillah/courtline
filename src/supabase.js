import { createClient } from '@supabase/supabase-js'
export const SB_URL = import.meta.env.VITE_SUPABASE_URL
export const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// Sesi login panitia disimpan PER TAB (sessionStorage), bukan permanen (localStorage).
// Artinya: menutup tab/aplikasi = harus login lagi, dan HP/laptop yang pernah dipakai login
// tidak otomatis langsung masuk dashboard admin. Jika sessionStorage tidak tersedia, sesi hanya di memori.
const mem = {}
const store = {
  getItem: k => { try { return sessionStorage.getItem(k) } catch { return mem[k] ?? null } },
  setItem: (k, v) => { try { sessionStorage.setItem(k, v) } catch { mem[k] = v } },
  removeItem: k => { try { sessionStorage.removeItem(k) } catch { delete mem[k] } }
}

// Hapus sesi lama yang dulu tersimpan permanen di perangkat ini (versi sebelumnya), supaya tidak ada yang tetap "login selamanya".
try { Object.keys(localStorage).filter(k => /^sb-.*-auth-token/.test(k)).forEach(k => localStorage.removeItem(k)) } catch { /* tidak ada storage */ }

export const supabase = createClient(SB_URL, SB_KEY, {
  auth: { storage: store, storageKey: 'cl-admin-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
})
