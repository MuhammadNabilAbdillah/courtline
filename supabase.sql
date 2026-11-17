-- Courtline v8 (HIPMI Bontang Padel Cup). Run the whole file in Supabase > SQL Editor (safe to re-run).

-- PART 1: tables (new installs) + upgrades (existing installs)
create table if not exists tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  gender text not null default 'Men' check (gender in ('Men','Women','Mixed')),
  level text not null default 'Beginner', -- bebas: admin boleh membuat tingkat/kategori apa pun
  start_date date,
  created_at timestamptz default now()
);
create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  player1 text not null,
  player2 text not null,
  created_at timestamptz default now()
);
create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  team1 uuid references teams(id) on delete cascade,
  team2 uuid references teams(id) on delete cascade,
  court text default 'Court 1',
  round text default 'Group Stage',
  start_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','live','finished')),
  best_of int not null default 3,
  golden boolean not null default true,
  sets jsonb not null default '[]',
  g jsonb not null default '[0,0]',
  p jsonb not null default '[0,0]',
  history jsonb not null default '[]',
  winner uuid references teams(id),
  created_at timestamptz default now()
);
alter table teams add column if not exists grp text default 'A';
alter table teams add column if not exists tournament_id uuid references tournaments(id) on delete cascade;
alter table matches add column if not exists tournament_id uuid references tournaments(id) on delete cascade;
alter table matches add column if not exists code text;
alter table matches add column if not exists slot1 text;
alter table matches add column if not exists slot2 text;
alter table matches add column if not exists duration int not null default 60;
alter table matches add column if not exists target int;
alter table matches add column if not exists scoring text not null default 'tennis';  -- 'race' = Race to N points
alter table matches add column if not exists locked boolean not null default false;  -- final score locked
alter table matches add column if not exists wo boolean not null default false;      -- walkover (opponent did not show)
alter table matches add column if not exists referee text;
alter table matches add column if not exists notes text;
alter table matches add column if not exists points jsonb not null default '[]';  -- point-by-point log: [{t:0|1, at:ms, sc:"3-2"}]

-- PART 2: security (safe to re-run)
create table if not exists staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  role text not null default 'scorer' check (role in ('admin','scorer')),
  created_at timestamptz default now()
);
alter table tournaments enable row level security;
alter table teams enable row level security;
alter table matches enable row level security;
alter table staff enable row level security;
create or replace function is_admin() returns boolean language sql security definer stable set search_path = public
  as $$ select exists (select 1 from staff where user_id = auth.uid() and role = 'admin') $$;
create or replace function is_staff() returns boolean language sql security definer stable set search_path = public
  as $$ select exists (select 1 from staff where user_id = auth.uid()) $$;
drop policy if exists "public read teams" on teams;   drop policy if exists "admin write teams" on teams;
drop policy if exists "public read matches" on matches; drop policy if exists "admin write matches" on matches;
drop policy if exists "read tournaments" on tournaments; drop policy if exists "admin tournaments" on tournaments;
drop policy if exists "read teams" on teams; drop policy if exists "admin teams" on teams;
drop policy if exists "read matches" on matches; drop policy if exists "admin insert matches" on matches; drop policy if exists "admin delete matches" on matches; drop policy if exists "staff update matches" on matches;
drop policy if exists "staff read self" on staff; drop policy if exists "admin manage staff" on staff;
create policy "read tournaments" on tournaments for select using (true);
create policy "admin tournaments" on tournaments for all to authenticated using (is_admin()) with check (is_admin());
create policy "read teams" on teams for select using (true);
create policy "admin teams" on teams for all to authenticated using (is_admin()) with check (is_admin());
create policy "read matches" on matches for select using (true);
create policy "admin insert matches" on matches for insert to authenticated with check (is_admin());
create policy "admin delete matches" on matches for delete to authenticated using (is_admin());
create policy "staff update matches" on matches for update to authenticated using (is_staff()) with check (is_staff());
create policy "staff read self" on staff for select to authenticated using (user_id = auth.uid() or is_admin());
create policy "admin manage staff" on staff for all to authenticated using (is_admin()) with check (is_admin());
do $$ begin alter publication supabase_realtime add table tournaments; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table teams; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table matches; exception when others then null; end $$;

-- Announcements (banner shown to everyone; only admins can write)
create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  level text not null default 'info' check (level in ('info','warning')),
  active boolean not null default true,
  created_at timestamptz default now()
);
alter table announcements enable row level security;
drop policy if exists "read announcements" on announcements; drop policy if exists "admin announcements" on announcements;
create policy "read announcements" on announcements for select using (true);
create policy "admin announcements" on announcements for all to authenticated using (is_admin()) with check (is_admin());
do $$ begin alter publication supabase_realtime add table announcements; exception when others then null; end $$;

-- ===== v6 additions =====
-- Site settings (one row, id = 'main'): event name, logo, colour, time zone, default rules, courts
create table if not exists settings (
  id text primary key,
  data jsonb not null default '{}',
  updated_at timestamptz default now()
);
alter table settings enable row level security;
drop policy if exists "read settings" on settings; drop policy if exists "admin settings" on settings;
create policy "read settings" on settings for select using (true);
create policy "admin settings" on settings for all to authenticated using (is_admin()) with check (is_admin());
do $$ begin alter publication supabase_realtime add table settings; exception when others then null; end $$;

-- Change history: who changed what, and when (the actor is filled in by the server, so it cannot be faked)
create table if not exists audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor text not null default '',
  action text not null,
  detail text
);
alter table audit_log enable row level security;
create or replace function set_audit_actor() returns trigger language plpgsql security definer set search_path = public as $$
begin new.actor := coalesce((select username from staff where user_id = auth.uid()), new.actor, ''); return new; end $$;
drop trigger if exists set_audit_actor on audit_log;
create trigger set_audit_actor before insert on audit_log for each row execute function set_audit_actor();
drop policy if exists "staff insert audit" on audit_log; drop policy if exists "admin read audit" on audit_log;
create policy "staff insert audit" on audit_log for insert to authenticated with check (is_staff());
create policy "admin read audit" on audit_log for select to authenticated using (is_admin());

-- Locked matches cannot be changed by anyone until an admin unlocks them
create or replace function guard_locked_match() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.locked and new.locked then raise exception 'This match is locked. An admin must unlock it first.'; end if;
  if old.locked and not new.locked and not is_admin() then raise exception 'Only an admin can unlock a match.'; end if;
  return new;
end $$;
drop trigger if exists guard_locked_match on matches;
create trigger guard_locked_match before update on matches for each row execute function guard_locked_match();

-- Admins can reset a staff member's password (the app has no access to the service key, so this runs in the database)
create or replace function admin_reset_password(target uuid, new_password text) returns void
  language plpgsql security definer set search_path = public, extensions, auth as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  if length(coalesce(new_password, '')) < 6 then raise exception 'Password must be at least 6 characters'; end if;
  update auth.users set encrypted_password = crypt(new_password, gen_salt('bf')), updated_at = now() where id = target;
  if not found then raise exception 'Account not found'; end if;
end $$;
revoke all on function admin_reset_password(uuid, text) from public, anon;
grant execute on function admin_reset_password(uuid, text) to authenticated;

-- Backups: the newest 60 copies are kept
create table if not exists backups (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null default 'auto',
  data jsonb not null
);
alter table backups enable row level security;
drop policy if exists "admin read backups" on backups; drop policy if exists "admin delete backups" on backups;
create policy "admin read backups" on backups for select to authenticated using (is_admin());
create policy "admin delete backups" on backups for delete to authenticated using (is_admin());
create or replace function make_backup_internal(k text default 'auto') returns bigint language plpgsql security definer set search_path = public as $$
declare bid bigint;
begin
  insert into backups(kind, data) values (k, jsonb_build_object(
    'app', 'courtline', 'exported_at', now(),
    'tournaments', coalesce((select jsonb_agg(to_jsonb(x)) from tournaments x), '[]'::jsonb),
    'teams', coalesce((select jsonb_agg(to_jsonb(x)) from teams x), '[]'::jsonb),
    'matches', coalesce((select jsonb_agg(to_jsonb(x)) from matches x), '[]'::jsonb),
    'announcements', coalesce((select jsonb_agg(to_jsonb(x)) from announcements x), '[]'::jsonb),
    'settings', coalesce((select jsonb_agg(to_jsonb(x)) from settings x), '[]'::jsonb)
  )) returning id into bid;
  delete from backups where id not in (select id from backups order by created_at desc, id desc limit 60);
  return bid;
end $$;
revoke all on function make_backup_internal(text) from public, anon, authenticated;
create or replace function make_backup(k text default 'manual') returns bigint language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  return make_backup_internal(case when k = 'auto' then 'auto' else 'manual' end);
end $$;
revoke all on function make_backup(text) from public, anon;
grant execute on function make_backup(text) to authenticated;

-- Scheduled backup every 6 hours (needs the pg_cron extension; if it cannot be enabled here, turn it on in
-- Supabase > Database > Extensions. The app also takes a backup whenever an admin opens the console and the last one is older than 6 hours.)
do $$ begin
  create extension if not exists pg_cron;
  begin perform cron.unschedule('courtline-backup'); exception when others then null; end;
  perform cron.schedule('courtline-backup', '0 */6 * * *', 'select public.make_backup_internal(''auto'')');
exception when others then raise notice 'pg_cron is not available (%). Automatic backups still run while an admin is signed in.', sqlerrm;
end $$;

-- ===== v9: kategori bebas + bagan manual =====
-- Aman dijalankan berulang kali (juga di database yang sudah berjalan).
-- 1) Nama tingkat/kategori tidak lagi dibatasi daftar tetap, supaya admin bisa membuat kategori sendiri (mis. Amatir).
alter table tournaments drop constraint if exists tournaments_level_check;
-- 2) Jenis kategori: Putra, Putri, atau Campuran.
alter table tournaments drop constraint if exists tournaments_gender_check;
alter table tournaments add constraint tournaments_gender_check check (gender in ('Men','Women','Mixed'));
-- 3) Penanda "tim dipilih manual" pada pertandingan bagan, supaya pengisian otomatis tidak menimpanya.
alter table matches add column if not exists manual boolean not null default false;

-- PART 3: first admin.
-- 1) Supabase > Authentication > Users > Add user:
--      email: admin@courtline.app   password: admin123   (tick "Auto Confirm User")
-- 2) Authentication > Providers > Email: turn OFF "Confirm email" (so accounts added in the app work immediately)
-- 3) Run this, then log in with username "admin" and CHANGE THE PASSWORD in Settings:
insert into staff (user_id, username, role)
select id, 'admin', 'admin' from auth.users where email = 'admin@courtline.app'
on conflict do nothing;
