import { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/auth/admin";
import { ok, fail, internalError } from "@/lib/api/respond";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { analyzeAgeRange, AgeAnalysisValidationError } from "@/lib/aws/rekognition";
import { headObject } from "@/lib/aws/s3";
import { logger } from "@/lib/logger";

/** Admin retry of Rekognition analysis for a failed scan. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    await requireAdminSession();
  } catch {
    return fail("unauthorized", "Admin access required.", 401);
  }

  const { sessionId } = await params;
  const supabase = getSupabaseAdmin();

  const { data: asset } = await supabase
    .from("scan_assets")
    .select("object_key")
    .eq("session_id", sessionId)
    .eq("kind", "best_frame")
    .maybeSingle();

  if (!asset) return fail("not_found", "No best frame asset found.", 404);

  const head = await headObject(asset.object_key);
  if (!head.exists) return fail("asset_missing", "The best frame is missing from storage.", 409);

  await supabase
    .from("scan_sessions")
    .update({ status: "analyzing" })
    .eq("id", sessionId);

  try {
    const age = await analyzeAgeRange(asset.object_key);
    const { error } = await supabase
      .from("scan_sessions")
      .update({
        status: "completed",
        age_low: age.ageLow,
        age_high: age.ageHigh,
        age_provider: age.provider,
        age_model_version: age.modelVersion,
        age_analyzed_at: new Date().toISOString(),
        face_confidence: age.faceConfidence,
        failure_code: null,
        failure_message: null,
      })
      .eq("id", sessionId);

    if (error) {
      logger.error("retry_result_save_failed", { sessionId, error: error.message });
      return internalError("Could not save the retry result.");
    }

    await supabase.from("scan_audit_events").insert({
      session_id: sessionId,
      event_type: "analysis_retried",
      event_data: { ageLow: age.ageLow, ageHigh: age.ageHigh },
    });

    return ok({ status: "completed", ageRange: { low: age.ageLow, high: age.ageHigh } });
  } catch (err) {
    if (err instanceof AgeAnalysisValidationError) {
      await supabase
        .from("scan_sessions")
        .update({ status: "failed", failure_code: err.code, failure_message: err.message })
        .eq("id", sessionId);
      return fail(err.code, err.message, 422);
    }
    logger.error("retry_analysis_error", { sessionId, error: (err as Error).message });
    return internalError("Analysis retry failed.");
  }
}
