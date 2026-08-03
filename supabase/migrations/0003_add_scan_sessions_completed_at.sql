-- 0003_add_scan_sessions_completed_at.sql
--
-- The API has always exposed a `completedAt` for a scan (see ScanStatus in
-- src/lib/scan/api.ts), and both GET /api/scans/[sessionId]/status and the
-- admin scan list read scan_sessions.completed_at — but the column was never
-- created. 0001 shipped recording_completed_at, which marks the end of the
-- capture, not the end of analysis.
--
-- The status route names its columns explicitly, so PostgREST rejected the
-- unknown column and the route's `error || !data` branch reported it as
-- "Scan session not found." (404) — on the result page of a scan that had in
-- fact completed successfully.

alter table public.scan_sessions
  add column if not exists completed_at timestamptz null;

-- Best-effort backfill so scans that already finished show a sensible time
-- rather than a blank. Ordered most- to least-specific.
update public.scan_sessions
set completed_at = coalesce(
  skin_analyzed_at,
  age_analyzed_at,
  recording_completed_at,
  updated_at
)
where status = 'completed'
  and completed_at is null;
