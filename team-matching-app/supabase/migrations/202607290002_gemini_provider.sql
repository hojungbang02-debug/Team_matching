alter table public.room_rubrics
  drop constraint if exists room_rubrics_source_check;

update public.room_rubrics
set source = 'gemini'
where source = 'openai';

alter table public.room_rubrics
  add constraint room_rubrics_source_check
  check (source in ('gemini', 'teacher', 'demo-fallback'));

alter table public.matching_runs
  drop constraint if exists matching_runs_provider_check;

update public.matching_runs
set provider = 'gemini'
where provider = 'openai';

alter table public.matching_runs
  add constraint matching_runs_provider_check
  check (provider in ('gemini', 'demo-fallback'));
