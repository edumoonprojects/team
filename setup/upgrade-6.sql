-- EduMoon Team Portal: upgrade 6 (photo for Sruthi)
-- Run ONCE in Supabase SQL Editor. Safe to run again. No quote marks, so copy and paste is safe.

update public.profiles set photo = $q$sruthi.jpg$q$ where name ilike $q$Sruthi%$q$;
update public.profiles set photo = $q$spandana.jpg$q$ where name ilike $q$%Spandana%$q$;

select name, photo from public.profiles where name ilike $q$%Sruthi%$q$ or name ilike $q$%Spandana%$q$;
