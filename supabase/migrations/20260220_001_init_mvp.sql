-- FashionApp MVP schema (investor demo)

create extension if not exists "pgcrypto";

create table if not exists public.closet_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  image_url text not null,
  category text not null check (category in ('top', 'bottom', 'dress', 'outerwear', 'shoes', 'accessories')),
  color text not null,
  style_tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt_text text not null,
  generation_mode text not null check (generation_mode in ('closet_only', 'allow_extras')),
  subject_mode text not null check (subject_mode in ('mannequin', 'personal')),
  model_name text not null default 'gpt-image-1',
  status text not null check (status in ('queued', 'running', 'succeeded', 'failed')) default 'queued',
  latency_ms integer,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generation_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.generation_jobs(id) on delete cascade,
  image_url text not null,
  prompt_text text not null,
  generation_mode text not null check (generation_mode in ('closet_only', 'allow_extras')),
  recipe_simplified jsonb not null,
  model_version text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.saved_looks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  generation_result_id uuid references public.generation_results(id) on delete set null,
  image_url text not null,
  prompt_text text not null,
  recipe_simplified jsonb not null,
  model_version text not null,
  calendar_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_closet_items_user_id on public.closet_items(user_id);
create index if not exists idx_generation_jobs_user_id on public.generation_jobs(user_id);
create index if not exists idx_generation_results_user_id on public.generation_results(user_id);
create index if not exists idx_saved_looks_user_id on public.saved_looks(user_id);
create index if not exists idx_saved_looks_calendar_date on public.saved_looks(calendar_date);
create index if not exists idx_usage_events_user_event_time on public.usage_events(user_id, event_type, created_at desc);

create or replace function public.set_updated_at_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_closet_items_updated_at on public.closet_items;
create trigger trg_closet_items_updated_at
before update on public.closet_items
for each row execute procedure public.set_updated_at_timestamp();

drop trigger if exists trg_generation_jobs_updated_at on public.generation_jobs;
create trigger trg_generation_jobs_updated_at
before update on public.generation_jobs
for each row execute procedure public.set_updated_at_timestamp();

drop trigger if exists trg_saved_looks_updated_at on public.saved_looks;
create trigger trg_saved_looks_updated_at
before update on public.saved_looks
for each row execute procedure public.set_updated_at_timestamp();

alter table public.closet_items enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.generation_results enable row level security;
alter table public.saved_looks enable row level security;
alter table public.usage_events enable row level security;

create policy "closet_items_owner_all"
on public.closet_items
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "generation_jobs_owner_all"
on public.generation_jobs
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "generation_results_owner_all"
on public.generation_results
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "saved_looks_owner_all"
on public.saved_looks
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "usage_events_owner_all"
on public.usage_events
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
