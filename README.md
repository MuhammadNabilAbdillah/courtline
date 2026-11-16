# HIPMI Bontang Padel Cup 2026 — Live Score (v8)
05 & 06 December 2026 · Vamos Arena Fit (name, dates and venue are editable in Admin > Settings > Site).

## New in v8
**Staff**
- **Scorer mode** (Admin > Scorer): pick a court, get a full-screen scorer with two big +1 buttons, Undo and the team names. Keeps the screen awake. Scorer accounts land here after login.
- **Weak-signal protection**: every point is applied on the phone at once and kept in its storage, then sent in the background. A badge shows "N not sent yet" until the signal returns; nothing is lost if the page is closed.
- **Standings tie-break** (Admin > Standings): wins -> head-to-head -> point difference -> points scored. A warning appears when a finished group is still level; an admin can set the order by hand and every table and the bracket follow it.
- **Event info page editor** (Admin > Settings > Event info page): address, map link, extra rules, programme, committee contacts.
**Visitors**
- **Your turn** on the Live tab: star a team and see "plays around 10:30 on Court 2 · 1 match before yours" (delays carry forward court by court).
- **Schedule by court**: a table with courts as columns and start times as rows (Schedule > By court).
- **Teams** tab: all teams and players with search, star to follow.
- **Match page**: point-by-point history (who scored when).
- **Info** tab: venue + map, programme, rules, committee contacts. Countdown to kick-off on the home banner.

## Updating from v7 (important)
1. Supabase > SQL Editor: run the whole `supabase.sql` again (safe to re-run). It adds the `points` column used for the point history.
2. Copy these files over your project (keep your own `.env`), then `git add .` / `git commit -m "v8"` / `git push`.
3. Open Admin > Settings > System check and press "Run again": everything should be green, including "Point-by-point history column".
4. Before the event: test Scorer mode on a real phone, once with airplane mode on (play a few points, switch it off, watch the badge clear).

The older sections below still apply.


## Scoring: Race to N points
New matches are played as **Race to 6 / 5 / 4 points**: the first team to reach N points wins, no tennis-style 15/30/40. Pick the format when you schedule a match, in Settings > Default match rules, or when you generate fixtures. Matches that were created with the older formats keep working.

## Features
**Viewers**
- Live, Schedule, Bracket, Results, TV mode (with a QR code to open the scores on a phone)
- Favourite teams (star): your matches come first on Live, "My teams" filter, notifications for your teams
- Team profile page (record, group rank, every match) and a direct link for every match (WhatsApp share)
- Announcement banner, dark mode, install as an app (PWA), print the schedule

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
