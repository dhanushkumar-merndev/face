-- 0002_per_step_capture_and_skin_analysis.sql
--
-- 1. Capture is now per direction: CENTER, LEFT and RIGHT each produce their
--    own video segment and still frame, so an asset row is scoped by step.
-- 2. Adds the skin-age analysis columns written by the Groq vision pass.

-- ---------------------------------------------------------------
-- 1. Per-direction assets
-- ---------------------------------------------------------------

alter table public.scan_assets
  add column if not exists step public.scan_step_name null;

-- The old shape allowed one video + one frame per session. Replace it with a
-- uniqueness rule that is per (session, kind, step). Legacy rows have a null
-- step, which coalesces to '' and stays unique against the new per-step rows.
alter table public.scan_assets
  drop constraint if exists scan_assets_session_id_kind_key;

create unique index if not exists scan_assets_session_kind_step_uidx
  on public.scan_assets (session_id, kind, coalesce(step::text, ''));

create index if not exists scan_assets_session_step_idx
  on public.scan_assets (session_id, step);

-- The capture sequence changed from five steps to three.
alter table public.scan_sessions
  alter column challenge_version set default 'center-left-right-v2';

alter table public.scan_sessions
  alter column challenge_sequence set default '["CENTER","LEFT","RIGHT"]'::jsonb;

-- ---------------------------------------------------------------
-- 2. Skin analysis (Groq vision)
-- ---------------------------------------------------------------

alter table public.scan_sessions
  add column if not exists skin_age integer null
    check (skin_age is null or skin_age between 0 and 120),
  add column if not exists skin_confidence numeric(4,3) null
    check (skin_confidence is null or skin_confidence between 0 and 1),
  add column if not exists skin_status text not null default 'pending'
    check (skin_status in ('pending', 'completed', 'failed', 'skipped')),
  add column if not exists skin_analysis jsonb null,
  add column if not exists skin_provider text null,
  add column if not exists skin_model text null,
  add column if not exists skin_analyzed_at timestamptz null;

comment on column public.scan_sessions.skin_analysis is
  'Structured skin read-out from the vision model: scores, concerns and tips. Wellness guidance only — never a medical assessment.';
