-- EduMoon Team Portal: import existing activity (Chapters site + this week's events)
-- Run ONCE in Supabase SQL Editor, after upgrade-2.sql. Safe to run again: it skips anything already imported.
-- Everything here is added as approved by Vikas, so points show on the leaderboard straight away.

alter table public.events disable trigger events_guard;

insert into public.events (person, day, type, title, club, attendees, collab_with, note, status, points, verified_by, verified_at)
select p.id, v.day::date, v.type, v.title, v.club, null,
       coalesce((select array_agg(c.id) from public.profiles c where c.em_id = any(v.collab)), '{}'),
       v.note, 'approved', r.points,
       (select id from public.profiles where email = 'vikas@theedumoon.com' limit 1), now()
from (values
  -- From the Chapters site
  ('EM-26-VZG-AUW-001',  '2026-10-01', 'inperson', 'EduMoon Orientation, AU College for Women', null::text, array['EM-26-VZG-AUW-002'], 'Imported from the Chapters site. Exact October date not recorded.'),
  ('EM-26-HYD-MRU-001',  '2026-11-02', 'virtual',  'Turning Ideas into Opportunities', 'Entrepreneurship', array[]::text[], 'Imported from the Chapters site.'),
  ('EM-26-VZG-ADG-002',  '2026-11-05', 'virtual',  'Movie Story Time: Baahubali', 'English', array[]::text[], 'Imported from the Chapters site.'),
  ('EM-26-VZG-AUCE-002', '2026-11-07', 'virtual',  'AI Agents and Automation', 'Coding', array[]::text[], 'Imported from the Chapters site.'),
  ('EM-26-VZG-AUCE-001', '2026-11-10', 'whatsapp', 'Active in WhatsApp club groups', null, array[]::text[], 'Imported from the Chapters site.'),
  ('EM-26-VZG-AUCE-002', '2026-11-10', 'whatsapp', 'Active in WhatsApp club groups', null, array[]::text[], 'Imported from the Chapters site.'),
  ('EM-26-VZG-AUCE-003', '2026-11-10', 'whatsapp', 'Active in WhatsApp club groups', null, array[]::text[], 'Imported from the Chapters site.'),
  ('EM-26-VZG-ADG-002',  '2026-11-10', 'whatsapp', 'Active in WhatsApp club groups', null, array[]::text[], 'Imported from the Chapters site.'),
  ('EM-26-VZG-GVPW-001', '2026-11-10', 'whatsapp', 'Active in WhatsApp club groups', null, array[]::text[], 'Imported from the Chapters site.'),
  ('EM-26-HYD-MRU-001',  '2026-11-10', 'whatsapp', 'Active in WhatsApp club groups', null, array[]::text[], 'Imported from the Chapters site.'),
  -- This week (added by Vikas on 15 Nov)
  ('EM-26-VZG-AUCE-001', '2026-11-11', 'virtual',  'Time Boss', null, array[]::text[], 'Plenty of participants, count not recorded.'),
  ('EM-26-VZG-AUCE-003', '2026-11-12', 'virtual',  'Copycat or Original', 'Entrepreneurship', array[]::text[], 'Event name to be confirmed.'),
  ('EM-26-HYD-MRU-001',  '2026-11-13', 'virtual',  'AI Tools', 'Coding', array[]::text[], null),
  ('EM-26-VZG-GVPW-001', '2026-11-14', 'virtual',  'Public Speaking 101', 'English', array[]::text[], null)
) as v(em_id, day, type, title, club, collab, note)
join public.profiles p on p.em_id = v.em_id
join public.point_rules r on r.type = v.type
where not exists (
  select 1 from public.events e where e.person = p.id and e.day = v.day::date and e.title = v.title
);

alter table public.events enable trigger events_guard;

-- Shows what is now on the leaderboard
select coalesce(pr.short_name, pr.name) as student_lead, count(*) as events, sum(e.points) as points
from public.events e
join public.profiles pr on pr.id = any(array[e.person] || e.collab_with)
where e.status = 'approved'
group by 1 order by 3 desc;
