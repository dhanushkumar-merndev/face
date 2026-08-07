import { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/auth/admin";
import { ok, fail, internalError } from "@/lib/api/respond";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { analyzeAgeRange, isRekognitionConfigured } from "@/lib/aws/rekognition";
import { headObject } from "@/lib/aws/s3";
import { analyzeSkin, createStandardSkinReadout } from "@/lib/groq/skin-analysis";
import { isGroqConfigured } from "@/lib/groq/client";
import { logger } from "@/lib/logger";

/** Re-runs the available analysis services for an existing, verified capture. */
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
  const { data: frames } = await supabase
    .from("scan_assets")
    .select("object_key, step")
    .eq("session_id", sessionId)
    .eq("kind", "best_frame");

  const asset = frames?.find((frame) => frame.step === "CENTER") ?? frames?.[0];
  if (!asset) return fail("not_found", "No frontal frame asset found.", 404);

  const head = await headObject(asset.object_key);
  if (!head.exists) return fail("asset_missing", "The best frame is missing from storage.", 409);

  await supabase.from("scan_sessions").update({ status: "analyzing" }).eq("id", sessionId);

  let age: Awaited<ReturnType<typeof analyzeAgeRange>> | null = null;
  if (isRekognitionConfigured()) {
    try {
      age = await analyzeAgeRange(asset.object_key);
    } catch (err) {
      logger.warn("retry_age_analysis_unavailable", { sessionId, error: (err as Error).message });
    }
  }

  let skin = createStandardSkinReadout();
  if (isGroqConfigured()) {
    try {
      skin = await analyzeSkin({ frames: [{ step: asset.step ?? "CENTER", objectKey: asset.object_key }] });
    } catch (err) {
      logger.warn("retry_skin_analysis_unavailable", { sessionId, error: (err as Error).message });
    }
  }

  const completedAt = new Date().toISOString();
  const { error } = await supabase
    .from("scan_sessions")
    .update({
      status: "completed",
      completed_at: completedAt,
      age_low: age?.ageLow ?? null,
      age_high: age?.ageHigh ?? null,
      age_provider: age?.provider ?? null,
      age_model_version: age?.modelVersion ?? null,
      age_analyzed_at: age ? completedAt : null,
      face_confidence: age?.faceConfidence ?? null,
      skin_status: "completed",
      skin_age: skin.skinAge,
      skin_confidence: skin.confidence,
      skin_analysis: skin,
      skin_provider: skin.provider,
      skin_model: skin.model,
      skin_analyzed_at: completedAt,
      failure_code: null,
      failure_message: null,
    })
    .eq("id", sessionId);

  if (error) {
    logger.error("retry_result_save_failed", { sessionId, error: error.message });
    return internalError("Could not save the updated analysis.");
  }

  await supabase.from("scan_audit_events").insert({
    session_id: sessionId,
    event_type: "analysis_retried",
    event_data: { ageLow: age?.ageLow ?? null, ageHigh: age?.ageHigh ?? null, skinAge: skin.skinAge },
  });

  return ok({ status: "completed", ageRange: age ? { low: age.ageLow, high: age.ageHigh } : null, skinAge: skin.skinAge });
}
