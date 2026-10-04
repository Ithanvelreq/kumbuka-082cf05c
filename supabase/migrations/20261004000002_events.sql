-- Unified patient timeline. `content` shape depends on `type` and is validated in code
-- (supabase/functions/_shared/domain/schema.ts), not in Postgres.
-- needs_review lives inside content (single source of truth): filter with content->>'needs_review' = 'true'.
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null references public.patients(id) on delete cascade,
  type text not null check (type in ('symptom_log', 'doctor_diagnosis', 'doctor_prescription', 'lab_result')),
  content jsonb not null,
  source_lang text,
  created_at timestamptz not null default now()
);

create index if not exists events_patient_created_idx on public.events (patient_id, created_at);

alter table public.events enable row level security;
