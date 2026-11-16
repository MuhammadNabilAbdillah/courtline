# Courtline — Padel Live Score (v7)

## Scoring: Race to N points
New matches are played as **Race to 6 / 5 / 4 points**: the first team to reach N points wins, no tennis-style 15/30/40. Pick the format when you schedule a match, in Settings > Default match rules, or when you generate fixtures. Matches that were created with the older formats keep working.

## Features
**Viewers**
- Live, Schedule, Bracket, Results, TV mode (with a QR code to open the scores on a phone)
- Favourite teams (star): your matches come first on Live, "My teams" filter, notifications for your teams
- Team profile page (record, group rank, every match) and a direct link for every match (WhatsApp share)
- Announcement banner, dark mode, Indonesian / English, install as an app (PWA), print the schedule

**Staff (Admin console)**
- Overview of the event (progress, next match, estimated finish, late matches)
- Generate group fixtures: all round-robin matches spread over courts and days, no double bookings
- Draw groups (random or in list order), withdraw a team (walkovers for the rest), warning for duplicate players
- System check: confirms the database is fully set up before the event
- Edit score manually, walkover (WO), referee & notes, lock finished matches
- Reorder schedule (swap, ±15 min, change court, clash warnings), duplicate match, delay all
- Import teams from CSV/Excel, export Excel (.xlsx) and PDF (standings & results), print schedule
- Change history (who changed what, when), announcements

**Settings (admin)**
- Site name, logo and main colour, time zone and 12/24-hour clock, default match rules, courts
- Staff accounts: add, change role, reset password, remove
- Backups: automatic every 6 hours, manual, download and restore

## Updating an existing install (v6 -> v7, or older)
1. Supabase > SQL Editor: run the whole `supabase.sql` again (safe to re-run). It adds new match columns and the settings, history and backup tables.
2. Copy the files from this update over your project folder (keep your own `.env`).
3. `git add .` / `git commit -m "v7"` / `git push`. Vercel redeploys automatically and the link stays the same.

## First install
1. Supabase > SQL Editor: run the whole `supabase.sql`.
2. Create the first admin (see Part 3 comments in `supabase.sql`).
3. Copy `.env.example` to `.env` and fill in URL + anon key (on Vercel: Project > Settings > Environment Variables).
4. `npm install && npm run dev`
5. Admin > Tournaments: create a tournament, add teams, schedule matches, then "Generate knockout" after the group stage.

The whole site, including the admin console, is in English. Times are shown without a time-zone label; the zone itself is set in Settings.
