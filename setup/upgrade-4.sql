-- EduMoon Team Portal: upgrade 4 (admins can edit check-ins, Streak removed from events)
-- Run ONCE in Supabase SQL Editor. Safe to run again.
-- Uses $q$ instead of quote marks, so copy and paste on a Mac cannot break it.

create or replace function public.checkins_guard() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  v boolean := public.can_verify(new.person);
  excused boolean := new.kind in ($q$exams$q$, $q$family$q$, $q$unwell$q$, $q$no_task$q$);
begin
  if tg_op = $q$INSERT$q$ then
    if new.person <> public.me() then
      raise exception $q$You can only check in for yourself.$q$;
    end if;
    if new.day > current_date + 1 or new.day < current_date - 3 then
      raise exception $q$You can only check in for today or the last few days.$q$;
    end if;
    new.status := case when excused then $q$excused$q$ else $q$pending$q$ end;
    new.verified_by := null; new.verified_at := null; new.feedback := null;
    new.created_at := now(); new.updated_at := now();
    return new;
  end if;

  new.person := old.person;
  new.day := old.day;
  new.created_at := old.created_at;
  new.updated_at := now();

  if new.kind is distinct from old.kind
     or new.detail is distinct from old.detail
     or new.note is distinct from old.note then
    if old.person = public.me() and not (public.am_admin() and v) then
      -- the person fixing their own check-in: goes back for approval
      if old.status = $q$approved$q$ then
        raise exception $q$This check-in is already verified.$q$;
      end if;
      new.status := case when excused then $q$excused$q$ else $q$pending$q$ end;
      new.verified_by := null; new.verified_at := null; new.feedback := null;
      return new;
    end if;
    if public.am_admin() and v then
      -- an admin correcting it: counts as verified by that admin
      new.status := case when excused then $q$excused$q$ else $q$approved$q$ end;
      new.verified_by := public.me(); new.verified_at := now(); new.feedback := null;
      return new;
    end if;
    raise exception $q$Only Vikas or Aparna can change the check-in of someone else.$q$;
  end if;

  if new.status is distinct from old.status then
    if not v then
      raise exception $q$Only Vikas, Aparna or Srivalli can verify this.$q$;
    end if;
    if new.status not in ($q$approved$q$, $q$sent_back$q$) then
      raise exception $q$Not allowed.$q$;
    end if;
    new.verified_by := public.me();
    new.verified_at := now();
  else
    new.verified_by := old.verified_by;
    new.verified_at := old.verified_at;
    new.feedback := old.feedback;
  end if;
  return new;
end $fn$;

-- Streak is no longer an event type
delete from public.point_rules r
where r.type = $q$streak$q$ and not exists (select 1 from public.events e where e.type = $q$streak$q$);

select type, label, points from public.point_rules order by sort;
