-- Courtline v4. Run the whole file in Supabase > SQL Editor (safe to re-run).

-- PART 1: tables (new installs) + upgrades (existing installs)
create table if not exists tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  gender text not null default 'Men' check (gender in ('Men','Women')),
  level text not null default 'Beginner' check (level in ('Bronze','Lower Bronze','Upper Beginner','Beginner')),
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

-- PART 3: first admin.
-- 1) Supabase > Authentication > Users > Add user:
--      email: admin@courtline.app   password: admin123   (tick "Auto Confirm User")
-- 2) Authentication > Providers > Email: turn OFF "Confirm email" (so accounts added in the app work immediately)
-- 3) Run this, then log in with username "admin" and CHANGE THE PASSWORD in Settings:
insert into staff (user_id, username, role)
select id, 'admin', 'admin' from auth.users where email = 'admin@courtline.app'
on conflict do nothing;
