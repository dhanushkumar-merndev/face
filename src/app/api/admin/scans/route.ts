import { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/auth/admin";
import { ok, fail, internalError } from "@/lib/api/respond";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  let admin;
  try {
    admin = await requireAdminSession();
  } catch {
    return fail("unauthorized", "Admin access required.", 401);
  }

  const supabase = getSupabaseAdmin();
  const searchParams = req.nextUrl.searchParams;
  const requestedPage = Number(searchParams.get("page") ?? "1");
  const requestedPageSize = Number(searchParams.get("pageSize") ?? "20");
  const page = Number.isFinite(requestedPage) ? Math.max(1, Math.floor(requestedPage)) : 1;
  const pageSize = Number.isFinite(requestedPageSize)
    ? Math.min(50, Math.max(1, Math.floor(requestedPageSize)))
    : 20;
  const status = searchParams.get("status");
  const ageBand = searchParams.get("ageBand");

  // Explicit columns rather than "*": the row carries skin_analysis,
  // quality_summary and the Rekognition blobs, none of which the list renders.
  let query = supabase
    .from("scan_sessions")
    .select(
      "id, status, created_at, subject_name, subject_email, subject_phone, age_low, age_high, custom_challenge_passed, duration_ms, retention_until, completed_at, scan_steps(step, step_order, passed), scan_assets(kind, byte_size)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const validStatuses = new Set([
    "created", "consented", "recording", "uploading", "uploaded", "analyzing",
    "completed", "failed", "cancelled", "deletion_requested", "deleted",
  ]);
  if (status && validStatuses.has(status)) query = query.eq("status", status);
  if (ageBand) {
    const [low, high] = ageBand.split("-").map(Number);
    if (!Number.isNaN(low) && !Number.isNaN(high)) {
      query = query.gte("age_low", low).lte("age_high", high);
    }
  }

  const { data, error, count } = await query;

  if (error) {
    return internalError("Could not load scans.");
  }

  return ok({
    scans: (data ?? []).map((s) => ({
      id: s.id,
      status: s.status,
      createdAt: s.created_at,
      subject: s.subject_name ?? s.subject_email ?? s.subject_phone ?? null,
      ageRange:
        s.age_low !== null && s.age_high !== null ? { low: s.age_low, high: s.age_high } : null,
      challengePassed: s.custom_challenge_passed,
      durationMs: s.duration_ms,
      retentionUntil: s.retention_until,
      completedAt: s.completed_at,
      steps: s.scan_steps ?? [],
      assets: s.scan_assets ?? [],
    })),
    total: count ?? 0,
    page,
    pageSize,
    admin: { email: admin.email, role: admin.role },
  });
}
