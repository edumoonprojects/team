-- EduMoon Team Portal: upgrade 5 (rename the Sultana event to Copycat)
-- Run ONCE in Supabase SQL Editor. Safe to run again. No quote marks, so copy and paste is safe.

begin;
alter table public.events disable trigger events_guard;

update public.events e set title = $q$Copycat$q$, note = null
from public.profiles p
where p.id = e.person and p.name = $q$Sadia Sultana$q$ and e.title = $q$Copycat or Original$q$;

alter table public.events enable trigger events_guard;
commit;

select e.day, p.name, e.title from public.events e join public.profiles p on p.id = e.person
where p.name = $q$Sadia Sultana$q$ order by e.day;
