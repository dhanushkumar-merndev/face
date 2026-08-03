import { NextRequest } from "next/server";
import { ok, fail, internalError } from "@/lib/api/respond";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveSessionFromRequest } from "@/lib/auth/session-guard";
import { deleteObjects } from "@/lib/aws/s3";
import { clearScanSessionCookie } from "@/lib/auth/session-token";
import { logger } from "@/lib/logger";

/**
 * User-owned deletion. Deletion order:
 *  1. status = deletion_requested
 *  2. delete S3 objects
 *  3. delete/anonymize PII
 *  4. status = deleted, deleted_at set
 *  5. audit event
 * Idempotent: already-deleted sessions return success.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  const resolved = await resolveSessionFromRequest(req, sessionId);
  if (!resolved) {
    return fail("unauthorized", "This scan session is not accessible from this browser.", 401);
  }

  const supabase = getSupabaseAdmin();

  const { data: session } = await supabase
    .from("scan_sessions")
    .select("id, status, deleted_at")
    .eq("id", sessionId)
    .single();

  if (!session) return fail("not_found", "Scan session not found.", 404);

  // Idempotent.
  if (session.status === "deleted" || session.deleted_at) {
    await clearScanSessionCookie();
    return ok({ deleted: true });
  }

  // 1. Mark deletion_requested.
  await supabase
    .from("scan_sessions")
    .update({ status: "deletion_requested" })
    .eq("id", sessionId);

  // 2. Load all asset object keys and delete from S3.
  const { data: assets } = await supabase
    .from("scan_assets")
    .select("object_key, kind")
    .eq("session_id", sessionId);

  const keys = (assets ?? []).map((a) => a.object_key);
  try {
    await deleteObjects(keys);
  } catch (err) {
    logger.error("delete_s3_failed", { sessionId, error: (err as Error).message });
    // Partial failure: still remove DB record? Spec says deletion must be idempotent
    // and handle partial failures explicitly. We mark failed so admin can retry.
    await supabase
      .from("scan_sessions")
      .update({ status: "failed", failure_code: "deletion_failed" })
      .eq("id", sessionId);
    return fail("deletion_failed", "Could not delete all media. Please try again.", 502);
  }

  // 3. Anonymize PII + mark asset rows deleted.
  const { error: updateError } = await supabase
    .from("scan_sessions")
    .update({
      status: "deleted",
      deleted_at: new Date().toISOString(),
      subject_name: null,
      subject_email: null,
      subject_phone: null,
    })
    .eq("id", sessionId);

  if (updateError) {
    logger.error("delete_db_failed", { sessionId, error: updateError.message });
    return internalError("Could not finalize the deletion.");
  }

  await supabase.from("scan_assets").update({ deleted_at: new Date().toISOString() }).eq("session_id", sessionId);
  await supabase.from("scan_session_tokens").delete().eq("session_id", sessionId);

  await supabase.from("scan_audit_events").insert({
    session_id: sessionId,
    event_type: "scan_deleted_by_user",
    event_data: { deletedKeys: keys.length },
  });

  await clearScanSessionCookie();
  logger.info("scan_deleted", { sessionId });

  return ok({ deleted: true });
}
