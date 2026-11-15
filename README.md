# Courtline — Padel Live Score (v4)
1. Supabase > SQL Editor: run the whole `supabase.sql` (safe to re-run; it also upgrades older versions).
2. Create the first admin (see Part 3 comments in `supabase.sql`).
3. Copy `.env.example` to `.env` and fill in URL + anon key.
4. `npm install && npm run dev`
5. Admin > Tournaments: create a tournament (gender + category), then add teams, schedule matches, and use "Generate knockout" after the group stage.
All times are shown in WITA (UTC+8).
