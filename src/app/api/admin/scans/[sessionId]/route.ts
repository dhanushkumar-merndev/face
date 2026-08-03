import { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/auth/admin";
import { ok, fail } from "@/lib/api/respond";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { deleteObjects } from "@/lib/aws/s3";
import { logger } from "@/lib/logger";

export async function GET(
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

  const { data: session, error } = await supabase
    .from("scan_sessions")
    .select(
      "*, scan_steps(*), scan_assets(*), scan_audit_events(*), scan_deletion_requests(*)"
    )
    .eq("id", sessionId)
    .single();

  if (error || !session) return fail("not_found", "Scan not found.", 404);

  return ok({ scan: session });
}

/** Admin-authorized deletion of a scan and all its S3 assets. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  let admin;
  try {
    admin = await requireAdminSession();
  } catch {
    return fail("unauthorized", "Admin access required.", 401);
  }

  const { sessionId } = await params;
  const supabase = getSupabaseAdmin();

  const { data: session } = await supabase
    .from("scan_sessions")
    .select("id, status, deleted_at")
    .eq("id", sessionId)
    .single();

  if (!session) return fail("not_found", "Scan not found.", 404);
  if (session.status === "deleted" || session.deleted_at) {
    return ok({ deleted: true });
  }

  await supabase.from("scan_sessions").update({ status: "deletion_requested" }).eq("id", sessionId);

  const { data: assets } = await supabase
    .from("scan_assets")
    .select("object_key")
    .eq("session_id", sessionId);
  const keys = (assets ?? []).map((a) => a.object_key);

  try {
    await deleteObjects(keys);
  } catch (err) {
    logger.error("admin_delete_s3_failed", { sessionId, error: (err as Error).message });
    return fail("deletion_failed", "Could not delete media. Please retry.", 502);
  }

  await supabase
    .from("scan_sessions")
    .update({
      status: "deleted",
      deleted_at: new Date().toISOString(),
      subject_name: null,
      subject_email: null,
      subject_phone: null,
    })
    .eq("id", sessionId);
  await supabase.from("scan_assets").update({ deleted_at: new Date().toISOString() }).eq("session_id", sessionId);
  await supabase.from("scan_session_tokens").delete().eq("session_id", sessionId);

  await supabase.from("scan_audit_events").insert({
    session_id: sessionId,
    actor_user_id: admin.userId,
    event_type: "scan_deleted_by_admin",
    event_data: { deletedKeys: keys.length },
  });

  return ok({ deleted: true });
}
