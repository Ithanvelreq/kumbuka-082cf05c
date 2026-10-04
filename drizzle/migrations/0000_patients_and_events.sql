-- 20261004000001_patients.sql
create table if not exists public.patients (
  id text primary key,
  display_name text,
  pin_check text,
  created_at timestamptz not null default now()
);

grant all on public.patients to service_role;

alter table public.patients enable row level security;

-- 20261004000002_events.sql
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null references public.patients(id) on delete cascade,
  type text not null check (type in ('symptom_log', 'doctor_diagnosis', 'doctor_prescription', 'lab_result')),
  content jsonb not null,
  source_lang text,
  created_at timestamptz not null default now()
);

create index if not exists events_patient_created_idx on public.events (patient_id, created_at);

grant all on public.events to service_role;

alter table public.events enable row level security;