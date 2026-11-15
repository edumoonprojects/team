-- EduMoon Team Portal: upgrade 2 (events, points, leaderboard, recruitment, home, ideas)
-- Run this ONCE in Supabase: SQL Editor > New query > paste everything > Run.
-- Run it after setup.sql. It does not change or delete any existing data.

create or replace function public.am_sl_head() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_sl_head from public.profiles
                   where user_id = auth.uid() and active limit 1), false)
$$;
grant execute on function public.am_sl_head() to authenticated;

-- ---------- Points for each activity ----------
create table if not exists public.point_rules (
  type text primary key,
  label text not null,
  points int not null check (points between 0 and 1000),
  sort int not null default 0
);
insert into public.point_rules (type, label, points, sort) values
  ('inperson', 'In-person event (EduMoon Circle)', 40, 1),
  ('poll', 'EduMoon Poll', 30, 2),
  ('virtual', 'Virtual event', 25, 3),
  ('streak', 'Streak', 20, 4),
  ('whatsapp', 'WhatsApp group activity', 10, 5)
on conflict (type) do nothing;

-- ---------- Student Lead events ----------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  person uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  type text not null references public.point_rules(type),
  title text not null check (char_length(title) between 1 and 200),
  club text check (club is null or char_length(club) <= 60),
  attendees int check (attendees is null or attendees between 0 and 100000),
  link text check (link is null or char_length(link) <= 500),
  note text check (note is null or char_length(note) <= 1000),
  collab_with uuid[] not null default '{}',
  status text not null default 'pending' check (status in ('pending','approved','sent_back')),
  points int,
  feedback text check (feedback is null or char_length(feedback) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz
);
create index if not exists events_person on public.events (person);
create index if not exists events_status on public.events (status);
create index if not exists events_day on public.events (day);

create or replace function public.events_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m public.profiles;
  bad int;
begin
  select * into m from public.profiles where user_id = auth.uid() and active limit 1;
  if m.id is null then raise exception 'Not signed in.'; end if;

  if tg_op = 'INSERT' then
    if new.person <> m.id and not m.is_admin then
      raise exception 'You can only log your own events.';
    end if;
    if new.day > current_date or new.day < current_date - 30 then
      raise exception 'Pick a date within the last 30 days.';
    end if;
    new.status := 'pending'; new.points := null; new.feedback := null;
    new.verified_by := null; new.verified_at := null;
    new.created_at := now(); new.updated_at := now();
  else
    new.person := old.person;
    new.created_at := old.created_at;
    new.updated_at := now();
    if new.status is distinct from old.status then
      if not (m.is_admin and m.id <> old.person) then
        raise exception 'Only Vikas or Aparna can approve events.';
      end if;
      if new.status not in ('approved','sent_back','pending') then raise exception 'Not allowed.'; end if;
      new.verified_by := m.id; new.verified_at := now();
      if new.status = 'approved' then
        select points into new.points from public.point_rules where type = new.type;
      else
        new.points := null;
      end if;
    else
      if m.id <> old.person and not m.is_admin then raise exception 'Not allowed.'; end if;
      if old.status = 'approved' and not m.is_admin then
        raise exception 'This event is already approved.';
      end if;
      if m.id = old.person and old.status <> 'pending' then
        new.status := 'pending'; new.points := null; new.feedback := null;
        new.verified_by := null; new.verified_at := null;
      else
        new.verified_by := old.verified_by; new.verified_at := old.verified_at;
        new.points := old.points; new.feedback := old.feedback;
      end if;
    end if;
  end if;

  new.collab_with := array(select distinct x from unnest(coalesce(new.collab_with, '{}')) x where x <> new.person);
  select count(*) into bad from unnest(new.collab_with) x
    where not exists (select 1 from public.profiles p where p.id = x and p.is_student_lead and p.active);
  if bad > 0 then raise exception 'Collab partners must be Student Leads.'; end if;
  return new;
end $$;

drop trigger if exists events_guard on public.events;
create trigger events_guard before insert or update on public.events
  for each row execute function public.events_guard();

-- ---------- Recruitment tracker (Srivalli, Vikas, Aparna) ----------
create table if not exists public.recruits (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  college text check (college is null or char_length(college) <= 160),
  contact text check (contact is null or char_length(contact) <= 160),
  status text not null default 'contacted' check (status in ('contacted','interested','onboarded','not_interested')),
  note text check (note is null or char_length(note) <= 1000),
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  onboarded_at timestamptz
);

create or replace function public.recruits_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.added_by := public.me(); new.created_at := now();
  else
    new.added_by := old.added_by; new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  if new.status = 'onboarded' and (tg_op = 'INSERT' or old.status <> 'onboarded') then
    new.onboarded_at := now();
  elsif new.status <> 'onboarded' then
    new.onboarded_at := null;
  end if;
  return new;
end $$;
drop trigger if exists recruits_guard on public.recruits;
create trigger recruits_guard before insert or update on public.recruits
  for each row execute function public.recruits_guard();

-- ---------- Coming up at EduMoon ----------
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 160),
  day date,
  owner text check (owner is null or char_length(owner) <= 120),
  note text check (note is null or char_length(note) <= 500),
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- Ideas board ----------
create table if not exists public.ideas (
  id uuid primary key default gen_random_uuid(),
  author uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(body) between 1 and 1000),
  college text check (college is null or char_length(college) <= 160),
  status text not null default 'new' check (status in ('new','planned','done')),
  created_at timestamptz not null default now()
);
create table if not exists public.idea_votes (
  idea_id uuid not null references public.ideas(id) on delete cascade,
  person uuid not null references public.profiles(id) on delete cascade,
  primary key (idea_id, person)
);
create table if not exists public.idea_replies (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.ideas(id) on delete cascade,
  author uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create or replace function public.ideas_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.author := public.me(); new.status := 'new'; new.created_at := now();
  else
    if not public.am_admin() then raise exception 'Only Vikas or Aparna can change an idea.'; end if;
    new.author := old.author; new.body := old.body; new.created_at := old.created_at;
  end if;
  return new;
end $$;
drop trigger if exists ideas_guard on public.ideas;
create trigger ideas_guard before insert or update on public.ideas
  for each row execute function public.ideas_guard();

-- ---------- Row level security ----------
alter table public.point_rules enable row level security;
alter table public.events enable row level security;
alter table public.recruits enable row level security;
alter table public.plans enable row level security;
alter table public.ideas enable row level security;
alter table public.idea_votes enable row level security;
alter table public.idea_replies enable row level security;

drop policy if exists rules_read on public.point_rules;
create policy rules_read on public.point_rules for select to authenticated using (true);
drop policy if exists rules_write on public.point_rules;
create policy rules_write on public.point_rules for update to authenticated using (public.am_admin()) with check (public.am_admin());

drop policy if exists events_read on public.events;
create policy events_read on public.events for select to authenticated using (true);
drop policy if exists events_insert on public.events;
create policy events_insert on public.events for insert to authenticated
  with check (person = public.me() or public.am_admin());
drop policy if exists events_update on public.events;
create policy events_update on public.events for update to authenticated
  using (person = public.me() or public.am_admin()) with check (true);
drop policy if exists events_delete on public.events;
create policy events_delete on public.events for delete to authenticated
  using ((person = public.me() and status <> 'approved') or public.am_admin());

drop policy if exists recruits_all on public.recruits;
create policy recruits_all on public.recruits for all to authenticated
  using (public.am_admin() or public.am_sl_head())
  with check (public.am_admin() or public.am_sl_head());

drop policy if exists plans_read on public.plans;
create policy plans_read on public.plans for select to authenticated using (true);
drop policy if exists plans_write on public.plans;
create policy plans_write on public.plans for all to authenticated
  using (public.am_admin()) with check (public.am_admin());

drop policy if exists ideas_read on public.ideas;
create policy ideas_read on public.ideas for select to authenticated using (true);
drop policy if exists ideas_insert on public.ideas;
create policy ideas_insert on public.ideas for insert to authenticated with check (public.me() is not null);
drop policy if exists ideas_update on public.ideas;
create policy ideas_update on public.ideas for update to authenticated using (public.am_admin()) with check (public.am_admin());
drop policy if exists ideas_delete on public.ideas;
create policy ideas_delete on public.ideas for delete to authenticated
  using (author = public.me() or public.am_admin());

drop policy if exists votes_read on public.idea_votes;
create policy votes_read on public.idea_votes for select to authenticated using (true);
drop policy if exists votes_insert on public.idea_votes;
create policy votes_insert on public.idea_votes for insert to authenticated with check (person = public.me());
drop policy if exists votes_delete on public.idea_votes;
create policy votes_delete on public.idea_votes for delete to authenticated using (person = public.me());

drop policy if exists replies_read on public.idea_replies;
create policy replies_read on public.idea_replies for select to authenticated using (true);
drop policy if exists replies_insert on public.idea_replies;
create policy replies_insert on public.idea_replies for insert to authenticated with check (author = public.me());
drop policy if exists replies_delete on public.idea_replies;
create policy replies_delete on public.idea_replies for delete to authenticated
  using (author = public.me() or public.am_admin());

-- ---------- Short names (what the portal calls each person) ----------
alter table public.profiles add column if not exists short_name text check (short_name is null or char_length(short_name) <= 40);
update public.profiles set short_name = v.s from (values
  ('Vikas Kapuganti','Vikas'), ('Spandana Goppa','Spandana'), ('Bade Srivalli','Srivalli'),
  ('Pothula Harshita','Harshita'), ('Raga Harshitha Nemalapuri','Harshitha'), ('Sadia Sultana','Sultana'),
  ('Pinnamaraju Hasini','Hasini'), ('Reddi Maheswari','Maheswari'), ('G. Venkata Ramana Rao','Venkat'),
  ('Sofiya Zeba','Sofiya'), ('Karam Karuna Sundar Dora','Sundar')
) as v(n, s) where public.profiles.name = v.n and public.profiles.short_name is null;
