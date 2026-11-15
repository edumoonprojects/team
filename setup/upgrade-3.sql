-- EduMoon Team Portal: upgrade 3 (profile photos + December plans)
-- Run ONCE in Supabase SQL Editor. Safe to run again.
-- Uses $q$ instead of quote marks, so copy and paste on a Mac cannot break it.

alter table public.profiles add column if not exists photo text
  check (photo is null or char_length(photo) <= 80);

update public.profiles set photo = v.f from (values
  ($q$Chetana$q$, $q$chetana.jpg$q$),
  ($q$Pinnamaraju Hasini$q$, $q$hasini.jpg$q$),
  ($q$Reddi Maheswari$q$, $q$maheswari.jpg$q$),
  ($q$Pothula Harshita$q$, $q$harshita.jpg$q$),
  ($q$Raga Harshitha Nemalapuri$q$, $q$harshitha.jpg$q$),
  ($q$Sofiya Zeba$q$, $q$sofiya.jpg$q$),
  ($q$Spandana Goppa$q$, $q$spandana.jpg$q$),
  ($q$Bade Srivalli$q$, $q$srivalli.jpg$q$),
  ($q$Sadia Sultana$q$, $q$sultana.jpg$q$),
  ($q$Karam Karuna Sundar Dora$q$, $q$sundar.jpg$q$),
  ($q$G. Venkata Ramana Rao$q$, $q$venkat.jpg$q$)
) as v(n, f)
where public.profiles.name = v.n and public.profiles.photo is null;

insert into public.plans (title, day, owner, note, pinned)
select v.t, null, null, v.n, false
from (values
  ($q$Innovation Challenge Season 4$q$, $q$Coming soon. Details to be announced.$q$),
  ($q$Vibe Hackathon$q$, $q$December 2026$q$),
  ($q$Tech leads cohort$q$, $q$Starts December 2026$q$)
) as v(t, n)
where not exists (select 1 from public.plans p where p.title = v.t);

select name, photo from public.profiles where photo is not null order by name;
