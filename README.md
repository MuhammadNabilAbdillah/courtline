# Courtline — Padel Live Score (v6)

## Features
**Viewers**
- Live, Schedule, Bracket, Results, TV mode (with a QR code to open the scores on a phone)
- Favourite teams (star): your matches come first on Live, "My teams" filter, notifications for your teams
- Team profile page (record, group rank, every match) and a direct link for every match (WhatsApp share)
- Announcement banner, dark mode, Indonesian / English, install as an app (PWA), print the schedule

**Staff (Admin console)**
- Edit score manually, walkover (WO), referee & notes, lock finished matches
- Reorder schedule (swap, ±15 min, change court, clash warnings), duplicate match, delay all
- Import teams from CSV/Excel, export Excel (.xlsx) and PDF (standings & results), print schedule
- Change history (who changed what, when), announcements

**Settings (admin)**
- Site name, logo and main colour, time zone and 12/24-hour clock, default match rules, courts
- Staff accounts: add, change role, reset password, remove
- Backups: automatic every 6 hours, manual, download and restore

## Updating an existing install (v5 -> v6)
1. Supabase > SQL Editor: run the whole `supabase.sql` again (safe to re-run). It adds new match columns and the settings, history and backup tables.
2. Copy the files from this update over your project folder (keep your own `.env`).
3. `git add .` / `git commit -m "v6"` / `git push`. Vercel redeploys automatically and the link stays the same.

## First install
1. Supabase > SQL Editor: run the whole `supabase.sql`.
2. Create the first admin (see Part 3 comments in `supabase.sql`).
3. Copy `.env.example` to `.env` and fill in URL + anon key (on Vercel: Project > Settings > Environment Variables).
4. `npm install && npm run dev`
5. Admin > Tournaments: create a tournament, add teams, schedule matches, then "Generate knockout" after the group stage.

The language follows the visitor's phone (Indonesian or English) and can be switched with the EN/ID button. The admin console is in English.
