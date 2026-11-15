# Courtline — Padel Live Score (v5)

## New in v5
- **Edit score** (Admin > Matches, live or finished match): correct sets, current game and points by hand. Undo still works afterwards.
- **Announcements** (Admin > Announcements, admin only): banner on every page and the TV screen, e.g. "Schedule delayed 30 minutes".
- **Import teams** (Admin > Teams): upload a CSV or paste cells from Excel / Google Sheets.
- **Install as an app (PWA)**: "Install app" button, own icon, opens full screen from the home screen.

## Updating an existing install (v4 -> v5)
1. Supabase > SQL Editor: run the whole `supabase.sql` again (safe to re-run). It adds the `announcements` table.
2. Copy the files from this update over your project folder (keep your own `.env`).
3. `git add .` / `git commit -m "v5"` / `git push` — Vercel redeploys automatically and the link stays the same.

## First install
1. Supabase > SQL Editor: run the whole `supabase.sql`.
2. Create the first admin (see Part 3 comments in `supabase.sql`).
3. Copy `.env.example` to `.env` and fill in URL + anon key (on Vercel: Project > Settings > Environment Variables).
4. `npm install && npm run dev`
5. Admin > Tournaments: create a tournament, add teams, schedule matches, then "Generate knockout" after the group stage.

All times are shown in WITA (UTC+8).
