-- Stable patient info. The PIN itself is never stored (not even hashed).
-- pin_check = patients.id encrypted with a PIN-derived key (see PinCrypto port).
-- DEMO: NoOpPinCrypto stores a trivial marker here; see README.
create table if not exists public.patients (
  id text primary key,
  display_name text,
  pin_check text,
  created_at timestamptz not null default now()
);

-- Only edge functions (service role) touch this table. RLS on + no policies = anon/auth clients get nothing.
alter table public.patients enable row level security;
