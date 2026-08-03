import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api/respond";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveSessionFromRequest } from "@/lib/auth/session-guard";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  const resolved = await resolveSessionFromRequest(req, sessionId);
  if (!resolved) {
    return fail("unauthorized", "This scan session is not accessible from this browser.", 401);
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("scan_sessions")
    .select(
      "status, age_low, age_high, completed_at, failure_code, failure_message, custom_challenge_passed, skin_status, skin_age, skin_analysis"
    )
    .eq("id", sessionId)
    .single();

  if (error || !data) {
    return fail("not_found", "Scan session not found.", 404);
  }

  // Only the minimum user-safe result is returned — never S3 keys.
  return ok({
    status: data.status,
    ageRange:
      data.status === "completed" && data.age_low !== null && data.age_high !== null
        ? { low: data.age_low, high: data.age_high }
        : null,
    skinStatus: data.skin_status ?? "skipped",
    skinAge: data.skin_age ?? null,
    skin: data.skin_status === "completed" ? (data.skin_analysis ?? null) : null,
    completedAt: data.completed_at ?? null,
    failureCode: data.failure_code,
    failureMessage: data.failure_message,
    challengePassed: data.custom_challenge_passed,
  });
}
