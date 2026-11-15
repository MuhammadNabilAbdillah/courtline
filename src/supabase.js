import { createClient } from '@supabase/supabase-js'
export const SB_URL = import.meta.env.VITE_SUPABASE_URL
export const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
export const supabase = createClient(SB_URL, SB_KEY)
