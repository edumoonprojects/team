-- EduMoon Team Portal: database setup
-- Run this ONCE in Supabase: SQL Editor > New query > paste everything > Run.

create extension if not exists pgcrypto;

-- ---------- Tables ----------

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  email text,
  name text not null check (char_length(name) between 1 and 120),
  title text,
  chapter text,
  em_id text,
  is_admin boolean not null default false,
  is_team boolean not null default false,
  is_student_lead boolean not null default false,
  is_sl_head boolean not null default false,
  is_private boolean not null default false,
  active boolean not null default true,
  start_date date not null default current_date,
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_email_lower on public.profiles (lower(email));

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  details text check (details is null or char_length(details) <= 2000),
  assignee uuid not null references public.profiles(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  due_date date,
  status text not null default 'todo'
    check (status in ('todo','in_progress','waiting','submitted','done')),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz
);
create index if not exists tasks_assignee on public.tasks (assignee);
create index if not exists tasks_status on public.tasks (status);

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists task_comments_task on public.task_comments (task_id);

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  person uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  kind text not null check (kind in
    ('video','event','whatsapp','college','other','exams','family','unwell','no_task')),
  detail text check (detail is null or char_length(detail) <= 500),
  note text check (note is null or char_length(note) <= 1000),
  status text not null default 'pending'
    check (status in ('pending','approved','sent_back','excused')),
  feedback text check (feedback is null or char_length(feedback) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  unique (person, day)
);
create index if not exists checkins_status on public.checkins (status);

create table if not exists public.off_days (
  day date primary key,
  note text
);

-- ---------- Helper functions (who am I, what can I see) ----------

create or replace function public.me() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.profiles where user_id = auth.uid() and active limit 1
$$;

create or replace function public.am_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles
                   where user_id = auth.uid() and active limit 1), false)
$$;

-- Can I see this person's tasks (and assign them tasks)?
create or replace function public.can_see(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles t, public.profiles m
    where t.id = p and m.user_id = auth.uid() and m.active and (
      t.id = m.id
      or (m.is_admin and not t.is_private)
      or (m.is_team and t.is_team and not t.is_private)
      or (m.is_sl_head and t.is_student_lead)
    )
  )
$$;

-- Can I approve this person's work?
create or replace function public.can_verify(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles t, public.profiles m
    where t.id = p and m.user_id = auth.uid() and m.active and (
      (t.id = m.id and m.is_admin and m.is_private)
      or (t.id <> m.id and m.is_admin and not t.is_private)
      or (t.id <> m.id and m.is_sl_head and t.is_student_lead)
    )
  )
$$;

-- Can I see this person's check-ins (they include private reasons)?
create or replace function public.can_see_checkins(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles t, public.profiles m
    where t.id = p and m.user_id = auth.uid() and m.active and (
      t.id = m.id
      or (m.is_admin and not t.is_private)
      or (m.is_sl_head and t.is_student_lead)
    )
  )
$$;

-- Links a logged-in account to its profile by email (called after login).
create or replace function public.claim_profile() returns uuid
language plpgsql security definer set search_path = public as $$
declare
  pid uuid;
  em text := lower(auth.jwt() ->> 'email');
begin
  if auth.uid() is null or em is null then return null; end if;
  select id into pid from public.profiles where user_id = auth.uid();
  if pid is not null then return pid; end if;
  update public.profiles set user_id = auth.uid()
   where lower(email) = em and user_id is null and active
  returning id into pid;
  return pid;
end $$;

grant execute on function public.me(), public.am_admin(), public.can_see(uuid),
  public.can_verify(uuid), public.can_see_checkins(uuid), public.claim_profile()
  to authenticated;

-- ---------- Rules for tasks ----------

create or replace function public.tasks_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v boolean := public.can_verify(new.assignee);
begin
  if tg_op = 'INSERT' then
    new.created_by := public.me();
    new.created_at := now();
    new.submitted_at := null;
    new.verified_by := null;
    new.verified_at := null;
    if new.status in ('submitted','done') then new.status := 'todo'; end if;
    return new;
  end if;

  new.created_by := old.created_by;
  new.created_at := old.created_at;
  if new.assignee <> old.assignee
     and not (old.created_by = public.me() or public.am_admin()) then
    new.assignee := old.assignee;
  end if;

  if new.status = 'done' and old.status <> 'done' then
    if not v then
      raise exception 'Only Vikas, Aparna or Srivalli can approve this task.';
    end if;
    new.verified_by := public.me();
    new.verified_at := now();
    if new.submitted_at is null then new.submitted_at := now(); end if;
  elsif old.status = 'done' and new.status <> 'done' then
    if not v then raise exception 'This task is already approved.'; end if;
    new.verified_by := null;
    new.verified_at := null;
  else
    new.verified_by := old.verified_by;
    new.verified_at := old.verified_at;
  end if;

  if new.status = 'submitted' and old.status <> 'submitted' then
    new.submitted_at := now();
  elsif new.status <> 'done' and new.status <> 'submitted' then
    new.submitted_at := null;
  end if;
  return new;
end $$;

drop trigger if exists tasks_guard on public.tasks;
create trigger tasks_guard before insert or update on public.tasks
  for each row execute function public.tasks_guard();

-- ---------- Rules for check-ins ----------

create or replace function public.checkins_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v boolean := public.can_verify(new.person);
  excused boolean := new.kind in ('exams','family','unwell','no_task');
begin
  if tg_op = 'INSERT' then
    if new.person <> public.me() then
      raise exception 'You can only check in for yourself.';
    end if;
    if new.day > current_date + 1 or new.day < current_date - 3 then
      raise exception 'You can only check in for today or the last few days.';
    end if;
    new.status := case when excused then 'excused' else 'pending' end;
    new.verified_by := null;
    new.verified_at := null;
    new.feedback := null;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  new.person := old.person;
  new.day := old.day;
  new.created_at := old.created_at;
  new.updated_at := now();

  if new.kind is distinct from old.kind
     or new.detail is distinct from old.detail
     or new.note is distinct from old.note then
    if old.person <> public.me() then
      raise exception 'Only the person can change their own check-in.';
    end if;
    if old.status = 'approved' then
      raise exception 'This check-in is already verified.';
    end if;
    new.status := case when excused then 'excused' else 'pending' end;
    new.verified_by := null;
    new.verified_at := null;
    new.feedback := null;
    return new;
  end if;

  if new.status is distinct from old.status then
    if not v then
      raise exception 'Only Vikas, Aparna or Srivalli can verify this.';
    end if;
    if new.status not in ('approved','sent_back') then
      raise exception 'Not allowed.';
    end if;
    new.verified_by := public.me();
    new.verified_at := now();
  else
    new.verified_by := old.verified_by;
    new.verified_at := old.verified_at;
    new.feedback := old.feedback;
  end if;
  return new;
end $$;

drop trigger if exists checkins_guard on public.checkins;
create trigger checkins_guard before insert or update on public.checkins
  for each row execute function public.checkins_guard();

-- ---------- Row level security ----------

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;
alter table public.checkins enable row level security;
alter table public.off_days enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (true);
drop policy if exists profiles_admin_insert on public.profiles;
create policy profiles_admin_insert on public.profiles for insert to authenticated with check (public.am_admin());
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated using (public.am_admin()) with check (public.am_admin());
drop policy if exists profiles_admin_delete on public.profiles;
create policy profiles_admin_delete on public.profiles for delete to authenticated using (public.am_admin());

drop policy if exists tasks_read on public.tasks;
create policy tasks_read on public.tasks for select to authenticated
  using (public.can_see(assignee) or created_by = public.me());
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.can_see(assignee));
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated
  using (assignee = public.me() or created_by = public.me() or public.can_verify(assignee))
  with check (public.can_see(assignee) or created_by = public.me());
drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks for delete to authenticated
  using (created_by = public.me() or public.am_admin());

drop policy if exists comments_read on public.task_comments;
create policy comments_read on public.task_comments for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id));
drop policy if exists comments_insert on public.task_comments;
create policy comments_insert on public.task_comments for insert to authenticated
  with check (author = public.me() and exists (select 1 from public.tasks t where t.id = task_id));
drop policy if exists comments_delete on public.task_comments;
create policy comments_delete on public.task_comments for delete to authenticated
  using (author = public.me() or public.am_admin());

drop policy if exists checkins_read on public.checkins;
create policy checkins_read on public.checkins for select to authenticated
  using (public.can_see_checkins(person));
drop policy if exists checkins_insert on public.checkins;
create policy checkins_insert on public.checkins for insert to authenticated
  with check (person = public.me());
drop policy if exists checkins_update on public.checkins;
create policy checkins_update on public.checkins for update to authenticated
  using (person = public.me() or public.can_verify(person))
  with check (person = public.me() or public.can_verify(person));
drop policy if exists checkins_delete on public.checkins;
create policy checkins_delete on public.checkins for delete to authenticated
  using (public.am_admin());

drop policy if exists off_days_read on public.off_days;
create policy off_days_read on public.off_days for select to authenticated using (true);
drop policy if exists off_days_write on public.off_days;
create policy off_days_write on public.off_days for all to authenticated
  using (public.am_admin()) with check (public.am_admin());

-- ---------- Starting people ----------
-- Fill in the missing emails later from the portal's Admin page.

insert into public.profiles (name, email, title, chapter, em_id, is_admin, is_team, is_student_lead, is_sl_head, is_private) values
  ('Vikas Kapuganti', 'vikas@theedumoon.com', 'Co-Founder and CEO', null, null, true, false, false, false, true),
  ('Aparna', null, 'Admin and team oversight', null, null, true, false, false, false, false),
  ('Sruthi', null, 'EduMoon Instagram', null, null, false, true, false, false, false),
  ('Hardik', null, 'Video editor', null, null, false, true, false, false, false),
  ('Spandana Goppa', null, 'College outreach, events, YouTube guests and shoots', 'AU College for Women', 'EM-26-VZG-AUW-001', false, true, true, false, false),
  ('Bade Srivalli', null, 'Student Lead Head', 'Aditya Degree College, Gajuwaka', 'EM-26-VZG-ADG-001', false, false, true, true, false),
  ('Pothula Harshita', null, 'Student Lead', 'Andhra University College of Engineering', 'EM-26-VZG-AUCE-001', false, false, true, false, false),
  ('Raga Harshitha Nemalapuri', null, 'Student Lead', 'Andhra University College of Engineering', 'EM-26-VZG-AUCE-002', false, false, true, false, false),
  ('Sadia Sultana', null, 'Student Lead', 'Andhra University College of Engineering', 'EM-26-VZG-AUCE-003', false, false, true, false, false),
  ('Chetana', null, 'Student Lead', 'AU College for Women', 'EM-26-VZG-AUW-002', false, false, true, false, false),
  ('Pinnamaraju Hasini', null, 'Student Lead', 'Aditya Degree College, Gajuwaka', 'EM-26-VZG-ADG-002', false, false, true, false, false),
  ('Reddi Maheswari', null, 'Student Lead', 'St. Joseph''s College for Women', 'EM-26-VZG-SJC-001', false, false, true, false, false),
  ('G. Venkata Ramana Rao', null, 'Student Lead', 'Sanketika Vidya Parishad Engineering College', 'EM-26-VZG-SVP-001', false, false, true, false, false),
  ('Sofiya Zeba', null, 'Student Lead', 'GVP College of Engineering for Women', 'EM-26-VZG-GVPW-001', false, false, true, false, false),
  ('Karam Karuna Sundar Dora', null, 'Student Lead', 'Malla Reddy University x NIAT, Hyderabad', 'EM-26-HYD-MRU-001', false, false, true, false, false)
on conflict do nothing;
