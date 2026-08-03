-- 0001_face_scan_schema.sql
-- Face scan: sessions, steps, assets, audit events, deletion requests.
-- Media bytes live in private S3; Postgres stores metadata and object keys only.

create extension if not exists pgcrypto;

create type public.scan_status as enum (
  'created',
  'consented',
  'recording',
  'uploading',
  'uploaded',
  'analyzing',
  'completed',
  'failed',
  'cancelled',
  'deletion_requested',
  'deleted'
);

create type public.scan_step_name as enum (
  'CENTER',
  'LEFT',
  'RIGHT',
  'UP',
  'CENTER_FINAL'
);

create type public.scan_asset_kind as enum (
  'video',
  'best_frame',
  'thumbnail',
  'telemetry'
);

-- Admin role: a profile row marks a Supabase Auth user as a dashboard admin.
-- Admin authorization is enforced server-side on every admin endpoint.
create table public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'admin' check (role in ('admin', 'superadmin')),
  created_at timestamptz not null default now()
);

create table public.scan_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid null,
  user_id uuid null references auth.users(id) on delete set null,

  subject_name text null,
  subject_email text null,
  subject_phone text null,

  status public.scan_status not null default 'created',

  consent_given boolean not null default false,
  consent_version text null,
  consent_text_hash text null,
  consented_at timestamptz null,
  adult_declaration boolean not null default false,

  challenge_version text not null default 'center-left-right-up-center-v1',
  challenge_sequence jsonb not null default '["CENTER","LEFT","RIGHT","UP","CENTER_FINAL"]'::jsonb,

  recording_started_at timestamptz null,
  recording_completed_at timestamptz null,
  duration_ms integer null check (duration_ms is null or duration_ms between 0 and 60000),

  age_low integer null check (age_low is null or age_low between 0 and 120),
  age_high integer null check (age_high is null or age_high between 0 and 120),
  age_provider text null,
  age_model_version text null,
  age_analyzed_at timestamptz null,

  face_confidence numeric(6,3) null,
  face_count integer null,
  rekognition_pose jsonb null,
  rekognition_quality jsonb null,
  quality_summary jsonb null,

  custom_challenge_passed boolean not null default false,
  managed_liveness_used boolean not null default false,
  managed_liveness_score numeric(6,3) null,

  failure_code text null,
  failure_message text null,

  retention_until timestamptz null,
  deleted_at timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.scan_steps (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.scan_sessions(id) on delete cascade,
  step public.scan_step_name not null,
  step_order smallint not null,
  passed boolean not null default false,
  started_at timestamptz null,
  completed_at timestamptz null,
  hold_ms integer null,
  representative_yaw numeric(7,3) null,
  representative_pitch numeric(7,3) null,
  representative_roll numeric(7,3) null,
  frame_timestamp_ms integer null,
  quality jsonb null,
  created_at timestamptz not null default now(),
  unique(session_id, step)
);

create table public.scan_assets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.scan_sessions(id) on delete cascade,
  kind public.scan_asset_kind not null,
  bucket text not null,
  object_key text not null,
  mime_type text not null,
  byte_size bigint null check (byte_size is null or byte_size >= 0),
  etag text null,
  checksum_sha256 text null,
  width integer null,
  height integer null,
  duration_ms integer null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz null,
  unique(session_id, kind),
  unique(bucket, object_key)
);

create table public.scan_audit_events (
  id bigint generated always as identity primary key,
  session_id uuid null references public.scan_sessions(id) on delete set null,
  actor_user_id uuid null references auth.users(id) on delete set null,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  ip_hash text null,
  user_agent text null,
  created_at timestamptz not null default now()
);

create table public.scan_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.scan_sessions(id) on delete cascade,
  requester_user_id uuid null references auth.users(id) on delete set null,
  requester_email text null,
  status text not null default 'pending' check (status in ('pending','processing','completed','rejected')),
  reason text null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz null
);

-- HMAC-SHA256 hash of the anonymous session cookie token. The raw token never
-- touches the database; only the server-computed hash is stored.
create table public.scan_session_tokens (
  session_id uuid primary key references public.scan_sessions(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index scan_session_tokens_expiry_idx on public.scan_session_tokens(expires_at);

create index scan_sessions_created_at_idx on public.scan_sessions(created_at desc);
create index scan_sessions_status_idx on public.scan_sessions(status);
create index scan_sessions_user_id_idx on public.scan_sessions(user_id);
create index scan_sessions_retention_idx on public.scan_sessions(retention_until) where deleted_at is null;
create index scan_steps_session_idx on public.scan_steps(session_id, step_order);
create index scan_assets_session_idx on public.scan_assets(session_id);
create index scan_audit_session_idx on public.scan_audit_events(session_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger scan_sessions_set_updated_at
before update on public.scan_sessions
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------

alter table public.scan_sessions enable row level security;
alter table public.scan_steps enable row level security;
alter table public.scan_assets enable row level security;
alter table public.scan_audit_events enable row level security;
alter table public.scan_deletion_requests enable row level security;
alter table public.scan_session_tokens enable row level security;
alter table public.admin_profiles enable row level security;

-- Anonymous sessions must be created/completed through Next.js route handlers
-- using the service-role client. No anonymous direct client reads.
-- Authenticated users may read their own sessions and request deletion.

create policy "scan_sessions_select_own" on public.scan_sessions
  for select to authenticated
  using (user_id = auth.uid());

create policy "scan_steps_select_own" on public.scan_steps
  for select to authenticated
  using (
    exists (
      select 1 from public.scan_sessions s
      where s.id = scan_steps.session_id and s.user_id = auth.uid()
    )
  );

create policy "scan_assets_select_own" on public.scan_assets
  for select to authenticated
  using (
    exists (
      select 1 from public.scan_sessions s
      where s.id = scan_assets.session_id and s.user_id = auth.uid()
    )
  );

-- Users can request deletion of their own sessions (server still performs it).
create policy "scan_deletion_requests_insert_own" on public.scan_deletion_requests
  for insert to authenticated
  with check (
    exists (
      select 1 from public.scan_sessions s
      where s.id = scan_deletion_requests.session_id and s.user_id = auth.uid()
    )
  );

create policy "scan_deletion_requests_select_own" on public.scan_deletion_requests
  for select to authenticated
  using (
    exists (
      select 1 from public.scan_sessions s
      where s.id = scan_deletion_requests.session_id and s.user_id = auth.uid()
    )
  );

-- Admin profiles are readable by authenticated users (self lookup only);
-- mutation is service-role only.
create policy "admin_profiles_select_self" on public.admin_profiles
  for select to authenticated
  using (user_id = auth.uid());

-- Helper for service-role/admin flows: returns true when the auth user is an admin.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.admin_profiles
    where user_id = auth.uid()
  );
$$;
