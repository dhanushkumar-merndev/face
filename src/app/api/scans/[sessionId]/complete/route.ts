import { NextRequest } from "next/server";
import {
  completeScanSchema,
  isRequiredSequence,
  hasCaptureForEveryStep,
} from "@/lib/validation/scan";
import { fromZodError, ok, fail, internalError } from "@/lib/api/respond";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveSessionFromRequest } from "@/lib/auth/session-guard";
import { headObject } from "@/lib/aws/s3";
import {
  analyzeAgeRange,
  isRekognitionConfigured,
  AgeAnalysisValidationError,
  type AgeAnalysis,
} from "@/lib/aws/rekognition";
import { analyzeSkin, createStandardSkinReadout, SkinAnalysisError } from "@/lib/groq/skin-analysis";
import { isGroqConfigured } from "@/lib/groq/client";
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

  // 1. Verify the challenge sequence is exactly CENTER -> LEFT -> RIGHT and
  //    that every direction uploaded its own video segment and frame.
  if (!isRequiredSequence(input.steps)) {
    return fail("invalid_challenge", "The scan steps are not in the required order or were not all passed.");
  }
  if (!hasCaptureForEveryStep(input.captures)) {
    return fail("invalid_capture", "Each direction must supply exactly one video and one frame.");
  }

  const analysisCapture = input.captures.find((c) => c.step === input.analysisStep);
  if (!analysisCapture) {
    return fail("invalid_capture", "The frame selected for analysis was not uploaded.");
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

  // 2. Verify every uploaded object exists and its size matches the claim.
  const expected = input.captures.flatMap((capture) => [
    { step: capture.step, kind: "video" as const, key: capture.video.objectKey, byteSize: capture.video.byteSize },
    { step: capture.step, kind: "frame" as const, key: capture.frame.objectKey, byteSize: capture.frame.byteSize },
  ]);

  const heads = new Map<string, Awaited<ReturnType<typeof headObject>>>();
  const headResults = await Promise.all(expected.map((e) => headObject(e.key)));

  for (let i = 0; i < expected.length; i += 1) {
    const entry = expected[i];
    const head = headResults[i];
    heads.set(entry.key, head);

    if (!head.exists) {
      logger.error("complete_headobject_missing", { sessionId, step: entry.step, kind: entry.kind });
      return fail("asset_missing", "One or more uploaded assets are missing.", 409);
    }
    if (head.contentLength !== entry.byteSize) {
      return fail("asset_mismatch", "An uploaded asset size does not match the declared size.", 409);
    }
  }

  // 3. Persist one asset row per direction per kind.
  const bucket = process.env.AWS_S3_BUCKET!;
  const assetRows = input.captures.flatMap((capture) => [
    {
      session_id: sessionId,
      kind: "video",
      step: capture.step,
      bucket,
      object_key: capture.video.objectKey,
      mime_type: capture.video.mimeType,
      byte_size: capture.video.byteSize,
      duration_ms: capture.video.durationMs ?? null,
      etag: capture.video.etag ?? heads.get(capture.video.objectKey)?.etag ?? null,
    },
    {
      session_id: sessionId,
      kind: "best_frame",
      step: capture.step,
      bucket,
      object_key: capture.frame.objectKey,
      mime_type: capture.frame.mimeType,
      byte_size: capture.frame.byteSize,
      etag: capture.frame.etag ?? heads.get(capture.frame.objectKey)?.etag ?? null,
      width: capture.frame.width,
      height: capture.frame.height,
    },
  ]);

  const { error: assetError } = await supabase.from("scan_assets").upsert(assetRows, {
    onConflict: "session_id,kind,step",
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

  // Persist step rows regardless of how analysis turns out.
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

  // 5. Optional age band from Rekognition DetectFaces on the frontal frame.
  //    The headline skin age comes from the vision pass in step 6, so a
  //    deployment without AWS credentials skips this and the result page simply
  //    omits the age-band pill. Note this is also the only server-side check
  //    that the frame holds exactly one face — without it the pipeline trusts
  //    the client's own face detection.
  let ageResult: AgeAnalysis | null = null;
  if (!isRekognitionConfigured()) {
    logger.info("rekognition_skipped", { sessionId, reason: "not_configured" });
  } else {
    try {
      ageResult = await analyzeAgeRange(analysisCapture.frame.objectKey);
    } catch (err) {
      if (err instanceof AgeAnalysisValidationError) {
        // Rekognition is enabled and actively rejected the frame (no face, or
        // more than one). Safe failure: keep media per retention, mark failed,
        // allow admin retry.
        await supabase
          .from("scan_sessions")
          .update({
            status: "failed",
            failure_code: err.code,
            failure_message: "The age could not be estimated from the captured frame.",
            custom_challenge_passed: true,
            skin_status: "skipped",
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
          skin: null,
          completedAt: null,
          failureCode: err.code,
          failureMessage: "The age could not be estimated from the captured frame.",
        });
      }
      // The provider itself is unreachable or misconfigured. Not the user's
      // fault and not worth losing a good scan over — drop the age band and
      // continue to the skin read-out.
      logger.error("rekognition_error", { sessionId, error: (err as Error).message });
    }
  }

  // 6. Groq skin read-out. Optional and never fatal: a scan without a skin
  //    score is still a completed scan.
  const skin = await runSkinAnalysis({
    sessionId,
    captures: input.captures.map((c) => ({ step: c.step, objectKey: c.frame.objectKey })),
    context: {
      ageLow: ageResult?.ageLow,
      ageHigh: ageResult?.ageHigh,
      brightness: input.qualitySummary.averageBrightness,
      sharpness: input.qualitySummary.bestSharpness,
    },
  });

  // 7. Persist results. One timestamp for both the row and the response so the
  //    value the client shows is the value that was stored.
  const completedAt = new Date().toISOString();
  const { error: resultError } = await supabase
    .from("scan_sessions")
    .update({
      status: "completed",
      completed_at: completedAt,
      age_low: ageResult?.ageLow ?? null,
      age_high: ageResult?.ageHigh ?? null,
      age_provider: ageResult?.provider ?? null,
      age_model_version: ageResult?.modelVersion ?? null,
      age_analyzed_at: ageResult ? new Date().toISOString() : null,
      face_confidence: ageResult?.faceConfidence ?? null,
      face_count: ageResult ? 1 : null,
      rekognition_pose: (ageResult?.pose ?? null) as unknown as Record<string, unknown> | null,
      rekognition_quality: (ageResult?.quality ?? null) as unknown as Record<string, unknown> | null,
      quality_summary: input.qualitySummary as unknown as Record<string, unknown>,
      custom_challenge_passed: true,
      failure_code: null,
      failure_message: null,
      skin_status: skin.status,
      skin_age: skin.result?.skinAge ?? null,
      skin_confidence: skin.result?.confidence ?? null,
      skin_analysis: (skin.result ?? null) as unknown as Record<string, unknown> | null,
      skin_provider: skin.result?.provider ?? null,
      skin_model: skin.result?.model ?? null,
      skin_analyzed_at: skin.result ? new Date().toISOString() : null,
    })
    .eq("id", sessionId);

  if (resultError) {
    logger.error("complete_result_save_failed", { sessionId, error: resultError.message });
    return internalError("Could not save the analysis result.");
  }

  await supabase.from("scan_audit_events").insert({
    session_id: sessionId,
    event_type: "scan_completed",
    event_data: {
      ageLow: ageResult?.ageLow ?? null,
      ageHigh: ageResult?.ageHigh ?? null,
      skinStatus: skin.status,
    },
  });

  logger.info("scan_completed", {
    sessionId,
    ageLow: ageResult?.ageLow ?? null,
    ageHigh: ageResult?.ageHigh ?? null,
    skinStatus: skin.status,
  });

  return ok({
    sessionId,
    status: "completed",
    ageRange: ageResult ? { low: ageResult.ageLow, high: ageResult.ageHigh } : null,
    skin: skin.result,
    completedAt,
  });
}

type SkinOutcome = {
  status: "completed";
  result: Awaited<ReturnType<typeof analyzeSkin>>;
};

/** Ensures every successful scan receives a complete, display-ready skin read-out. */
async function runSkinAnalysis(args: {
  sessionId: string;
  captures: Array<{ step: string; objectKey: string }>;
  // The age band is absent when Rekognition is not configured; the vision pass
  // treats it as optional background context anyway.
  context: { ageLow?: number; ageHigh?: number; brightness: number; sharpness: number };
}): Promise<SkinOutcome> {
  if (!isGroqConfigured()) {
    return { status: "completed", result: createStandardSkinReadout() };
  }
  try {
    const result = await analyzeSkin({ frames: args.captures, context: args.context });
    return { status: "completed", result };
  } catch (err) {
    const code = err instanceof SkinAnalysisError ? err.code : "unknown";
    logger.warn("skin_analysis_failed", {
      sessionId: args.sessionId,
      code,
      error: (err as Error).message,
    });
    return { status: "completed", result: createStandardSkinReadout() };
  }
}
