-- EduMoon Team Portal: import existing activity (Chapters site + this weeks events)
-- Run ONCE in Supabase SQL Editor, after upgrade-2.sql. Safe to run again: it skips anything already imported.
-- Everything here is added as approved by Vikas, so points show on the leaderboard straight away.
-- This version uses $q$ instead of quote marks, so it survives copy and paste on a Mac.

begin;

alter table public.events disable trigger events_guard;

insert into public.events (person, day, type, title, club, attendees, collab_with, note, status, points, verified_by, verified_at)
select p.id, v.day::date, v.type, v.title, v.club, null,
       coalesce((select array_agg(c.id) from public.profiles c where c.em_id = any(v.collab)), $q${}$q$),
       v.note, $q$approved$q$, r.points,
       (select id from public.profiles where email = $q$vikas@theedumoon.com$q$ limit 1), now()
from (values
  -- From the Chapters site
  ($q$EM-26-VZG-AUW-001$q$,  $q$2026-10-01$q$, $q$inperson$q$, $q$EduMoon Orientation, AU College for Women$q$, null::text, array[$q$EM-26-VZG-AUW-002$q$], $q$Imported from the Chapters site. Exact October date not recorded.$q$),
  ($q$EM-26-HYD-MRU-001$q$,  $q$2026-11-02$q$, $q$virtual$q$,  $q$Turning Ideas into Opportunities$q$, $q$Entrepreneurship$q$, array[]::text[], $q$Imported from the Chapters site.$q$),
  ($q$EM-26-VZG-ADG-002$q$,  $q$2026-11-05$q$, $q$virtual$q$,  $q$Movie Story Time: Baahubali$q$, $q$English$q$, array[]::text[], $q$Imported from the Chapters site.$q$),
  ($q$EM-26-VZG-AUCE-002$q$, $q$2026-11-07$q$, $q$virtual$q$,  $q$AI Agents and Automation$q$, $q$Coding$q$, array[]::text[], $q$Imported from the Chapters site.$q$),
  ($q$EM-26-VZG-AUCE-001$q$, $q$2026-11-10$q$, $q$whatsapp$q$, $q$Active in WhatsApp club groups$q$, null, array[]::text[], $q$Imported from the Chapters site.$q$),
  ($q$EM-26-VZG-AUCE-002$q$, $q$2026-11-10$q$, $q$whatsapp$q$, $q$Active in WhatsApp club groups$q$, null, array[]::text[], $q$Imported from the Chapters site.$q$),
  ($q$EM-26-VZG-AUCE-003$q$, $q$2026-11-10$q$, $q$whatsapp$q$, $q$Active in WhatsApp club groups$q$, null, array[]::text[], $q$Imported from the Chapters site.$q$),
  ($q$EM-26-VZG-ADG-002$q$,  $q$2026-11-10$q$, $q$whatsapp$q$, $q$Active in WhatsApp club groups$q$, null, array[]::text[], $q$Imported from the Chapters site.$q$),
  ($q$EM-26-VZG-GVPW-001$q$, $q$2026-11-10$q$, $q$whatsapp$q$, $q$Active in WhatsApp club groups$q$, null, array[]::text[], $q$Imported from the Chapters site.$q$),
  ($q$EM-26-HYD-MRU-001$q$,  $q$2026-11-10$q$, $q$whatsapp$q$, $q$Active in WhatsApp club groups$q$, null, array[]::text[], $q$Imported from the Chapters site.$q$),
  -- This week (added by Vikas on 15 Nov)
  ($q$EM-26-VZG-AUCE-001$q$, $q$2026-11-11$q$, $q$virtual$q$,  $q$Time Boss$q$, null, array[]::text[], $q$Plenty of participants, count not recorded.$q$),
  ($q$EM-26-VZG-AUCE-003$q$, $q$2026-11-12$q$, $q$virtual$q$,  $q$Copycat or Original$q$, $q$Entrepreneurship$q$, array[]::text[], $q$Event name to be confirmed.$q$),
  ($q$EM-26-HYD-MRU-001$q$,  $q$2026-11-13$q$, $q$virtual$q$,  $q$AI Tools$q$, $q$Coding$q$, array[]::text[], null),
  ($q$EM-26-VZG-GVPW-001$q$, $q$2026-11-14$q$, $q$virtual$q$,  $q$Public Speaking 101$q$, $q$English$q$, array[]::text[], null)
) as v(em_id, day, type, title, club, collab, note)
join public.profiles p on p.em_id = v.em_id
join public.point_rules r on r.type = v.type
where not exists (
  select 1 from public.events e where e.person = p.id and e.day = v.day::date and e.title = v.title
);

alter table public.events enable trigger events_guard;

commit;

-- Shows what is now on the leaderboard
select coalesce(pr.short_name, pr.name) as student_lead, count(*) as events, sum(e.points) as points
from public.events e
join public.profiles pr on pr.id = any(array[e.person] || e.collab_with)
where e.status = $q$approved$q$
group by 1 order by 3 desc;
