import { NextRequest } from "next/server";
import {
  completeScanSchema,
  isRequiredSequence,
} from "@/lib/validation/scan";
import { fromZodError, ok, fail, internalError } from "@/lib/api/respond";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveSessionFromRequest } from "@/lib/auth/session-guard";
import { headObject } from "@/lib/aws/s3";
import { analyzeAgeRange, AgeAnalysisValidationError } from "@/lib/aws/rekognition";
import { logger } from "@/lib/logger";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  const resolved = await resolveSessionFromRequest(req, sessionId);
  if (!resolved) {
    return fail("unauthorized", "This scan session is not accessible from this browser.", 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("invalid_json", "Request body is not valid JSON.");
  }

  const parsed = completeScanSchema.safeParse(body);
  if (!parsed.success) return fromZodError(parsed.error);

  const input = parsed.data;

  // 1. Verify the challenge sequence is exactly CENTER->LEFT->RIGHT->UP->CENTER_FINAL.
  if (!isRequiredSequence(input.steps)) {
    return fail("invalid_challenge", "The scan steps are not in the required order or were not all passed.");
  }

  // The schema already rejects unknown steps (incl. DOWN) via z.enum.
  const containsDown = input.steps.some((s) => (s as { step: string }).step === "DOWN");
  if (containsDown) {
    return fail("invalid_challenge", "Invalid challenge sequence.");
  }

  const supabase = getSupabaseAdmin();

  const { data: session } = await supabase
    .from("scan_sessions")
    .select("id, status")
    .eq("id", sessionId)
    .single();

  if (!session) return fail("not_found", "Scan session not found.", 404);
  if (!["uploading", "uploaded", "analyzing"].includes(session.status)) {
    return fail("invalid_state", "Scan is not in an analyzable state.", 409);
  }

  // 2. Verify S3 objects exist and metadata matches.
  const [videoHead, frameHead] = await Promise.all([
    headObject(input.video.objectKey),
    headObject(input.bestFrame.objectKey),
  ]);

  if (!videoHead.exists || !frameHead.exists) {
    logger.error("complete_headobject_missing", { sessionId });
    return fail("asset_missing", "One or more uploaded assets are missing.", 409);
  }

  if (videoHead.contentLength !== input.video.byteSize) {
    return fail("asset_mismatch", "The uploaded video size does not match the declared size.", 409);
  }

  // 3. Persist asset rows.
  const assetRows = [
    {
      session_id: sessionId,
      kind: "video",
      bucket: process.env.AWS_S3_BUCKET!,
      object_key: input.video.objectKey,
      mime_type: input.video.mimeType,
      byte_size: input.video.byteSize,
      etag: input.video.etag ?? videoHead.etag ?? null,
    },
    {
      session_id: sessionId,
      kind: "best_frame",
      bucket: process.env.AWS_S3_BUCKET!,
      object_key: input.bestFrame.objectKey,
      mime_type: input.bestFrame.mimeType,
      byte_size: input.bestFrame.byteSize,
      etag: input.bestFrame.etag ?? frameHead.etag ?? null,
      width: input.bestFrame.width,
      height: input.bestFrame.height,
    },
  ];

  const { error: assetError } = await supabase.from("scan_assets").upsert(assetRows, {
    onConflict: "session_id,kind",
  });
  if (assetError) {
    logger.error("complete_assets_failed", { sessionId, error: assetError.message });
    return internalError("Could not save asset metadata.");
  }

  // 4. Status -> uploaded -> analyzing.
  await supabase.from("scan_sessions").update({ status: "uploaded" }).eq("id", sessionId);
  await supabase
    .from("scan_sessions")
    .update({
      status: "analyzing",
      duration_ms: input.durationMs,
      recording_completed_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  // 5. Rekognition DetectFaces on the best frame.
  let ageResult;
  try {
    ageResult = await analyzeAgeRange(input.bestFrame.objectKey);
  } catch (err) {
    if (err instanceof AgeAnalysisValidationError) {
      // Safe failure: keep media per retention, mark failed, allow admin retry.
      await supabase
        .from("scan_sessions")
        .update({
          status: "failed",
          failure_code: err.code,
          failure_message: "The age could not be estimated from the best frame.",
          custom_challenge_passed: true,
        })
        .eq("id", sessionId);
      await supabase.from("scan_audit_events").insert({
        session_id: sessionId,
        event_type: "analysis_failed",
        event_data: { code: err.code },
      });
      logger.warn("analysis_failed", { sessionId, code: err.code });
      return ok({
        sessionId,
        status: "failed",
        ageRange: null,
        completedAt: null,
        failureCode: err.code,
        failureMessage: "The age could not be estimated from the best frame.",
      });
    }
    logger.error("rekognition_error", { sessionId, error: (err as Error).message });
    return internalError("Age analysis failed. Please try again later.");
  }

  // 6. Persist results.
  const { error: resultError } = await supabase
    .from("scan_sessions")
    .update({
      status: "completed",
      age_low: ageResult.ageLow,
      age_high: ageResult.ageHigh,
      age_provider: ageResult.provider,
      age_model_version: ageResult.modelVersion,
      age_analyzed_at: new Date().toISOString(),
      face_confidence: ageResult.faceConfidence,
      face_count: 1,
      rekognition_pose: ageResult.pose as unknown as Record<string, unknown>,
      rekognition_quality: ageResult.quality as unknown as Record<string, unknown>,
      quality_summary: input.qualitySummary as unknown as Record<string, unknown>,
      custom_challenge_passed: true,
      failure_code: null,
      failure_message: null,
    })
    .eq("id", sessionId);

  if (resultError) {
    logger.error("complete_result_save_failed", { sessionId, error: resultError.message });
    return internalError("Could not save the analysis result.");
  }

  // Persist step rows.
  const stepRows = input.steps.map((s) => ({
    session_id: sessionId,
    step: s.step,
    step_order: s.stepOrder,
    passed: s.passed,
    hold_ms: s.holdMs,
    representative_yaw: s.yaw,
    representative_pitch: s.pitch,
    representative_roll: s.roll,
    frame_timestamp_ms: s.frameTimestampMs,
    completed_at: new Date().toISOString(),
  }));
  await supabase.from("scan_steps").upsert(stepRows, { onConflict: "session_id,step" });

  await supabase.from("scan_audit_events").insert({
    session_id: sessionId,
    event_type: "scan_completed",
    event_data: { ageLow: ageResult.ageLow, ageHigh: ageResult.ageHigh },
  });

  logger.info("scan_completed", {
    sessionId,
    ageLow: ageResult.ageLow,
    ageHigh: ageResult.ageHigh,
  });

  return ok({
    sessionId,
    status: "completed",
    ageRange: { low: ageResult.ageLow, high: ageResult.ageHigh },
    completedAt: new Date().toISOString(),
  });
}
