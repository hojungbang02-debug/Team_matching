create extension if not exists pgcrypto;
create extension if not exists vector;

create type public.room_phase as enum (
  'waiting',
  'collecting',
  'locked',
  'analyzing',
  'review',
  'completed'
);

create type public.participant_status as enum (
  'pending',
  'active',
  'late_pending',
  'withdrawn'
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  subject text not null,
  title text not null,
  class_name text,
  question text not null,
  phase public.room_phase not null default 'waiting',
  expected_count integer check (expected_count is null or expected_count > 0),
  team_mode text not null check (team_mode in ('auto', 'fixed')),
  fixed_team_count integer check (fixed_team_count is null or fixed_team_count > 0),
  target_team_size integer not null check (target_team_size between 2 and 12),
  recommended_max integer not null check (recommended_max between 2 and 12),
  hard_max integer not null check (hard_max between recommended_max and 12),
  password_hash text not null,
  teacher_token_hash text not null,
  question_opened_at timestamptz,
  responses_locked_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.room_rubrics (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  version integer not null default 1,
  question_intent text,
  matching_goal text,
  criteria jsonb not null,
  source text not null check (source in ('gemini', 'teacher', 'demo-fallback')),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, version)
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  display_name text not null,
  student_number text,
  normalized_identifier text not null,
  session_token_hash text not null,
  status public.participant_status not null default 'active',
  joined_at timestamptz not null default now(),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, normalized_identifier)
);

create table public.responses (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  answer text not null default '',
  submitted boolean not null default false,
  revision integer not null default 1,
  submitted_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (participant_id)
);

create table public.matching_runs (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  rubric_id uuid references public.room_rubrics(id) on delete set null,
  snapshot_at timestamptz not null,
  status text not null check (status in ('running', 'review', 'failed', 'completed')),
  provider text not null check (provider in ('gemini', 'demo-fallback')),
  analysis_model text,
  embedding_model text,
  random_seed text not null,
  warning_summary jsonb not null default '[]'::jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.response_analyses (
  id uuid primary key default gen_random_uuid(),
  matching_run_id uuid not null references public.matching_runs(id) on delete cascade,
  response_id uuid not null references public.responses(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  fields jsonb not null,
  information_score numeric(6, 5) not null check (information_score between 0 and 1),
  is_empty boolean not null,
  is_off_topic boolean not null,
  has_matching_information boolean not null,
  reason text not null,
  embedding vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (matching_run_id, participant_id)
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  matching_run_id uuid not null references public.matching_runs(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  team_number integer not null,
  target_capacity integer not null check (target_capacity > 0),
  seed_participant_id uuid references public.participants(id) on delete set null,
  representative_idea text,
  common_topic text,
  reason text,
  is_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (matching_run_id, team_number)
);

create table public.seeds (
  id uuid primary key default gen_random_uuid(),
  matching_run_id uuid not null references public.matching_runs(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  participant_id uuid not null references public.participants(id) on delete cascade,
  information_score numeric(6, 5) not null check (information_score between 0 and 1),
  diversity_score numeric(6, 5) not null check (diversity_score between 0 and 1),
  support_score numeric(6, 5) not null check (support_score between 0 and 1),
  seed_score numeric(6, 5) not null check (seed_score between 0 and 1),
  threshold_used numeric(4, 2) not null,
  manually_selected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (matching_run_id, participant_id)
);

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  matching_run_id uuid not null references public.matching_runs(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  similarity numeric(6, 5) check (similarity is null or similarity between 0 and 1),
  information_score numeric(6, 5) not null check (information_score between 0 and 1),
  matching_method text not null check (matching_method in ('seed', 'semantic', 'balanced', 'teacher')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (matching_run_id, participant_id)
);

create table public.teacher_approvals (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  matching_run_id uuid references public.matching_runs(id) on delete cascade,
  approval_type text not null,
  warning_code text not null,
  target_id uuid,
  reason text,
  teacher_session_hash text not null,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'rooms',
    'room_rubrics',
    'participants',
    'responses',
    'matching_runs',
    'response_analyses',
    'teams',
    'seeds',
    'team_members',
    'teacher_approvals'
  ]
  loop
    execute format(
      'create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end;
$$;

alter table public.rooms enable row level security;
alter table public.room_rubrics enable row level security;
alter table public.participants enable row level security;
alter table public.responses enable row level security;
alter table public.matching_runs enable row level security;
alter table public.response_analyses enable row level security;
alter table public.teams enable row level security;
alter table public.seeds enable row level security;
alter table public.team_members enable row level security;
alter table public.teacher_approvals enable row level security;

comment on table public.rooms is
  'Direct public access is intentionally blocked. Next.js server routes use the service role after verifying room or teacher session credentials.';

alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.participants;
alter publication supabase_realtime add table public.responses;
alter publication supabase_realtime add table public.teams;
