import { NextRequest } from "next/server";
import { ok, fail, internalError } from "@/lib/api/respond";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveSessionFromRequest } from "@/lib/auth/session-guard";
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

  const supabase = getSupabaseAdmin();

  const { data: session } = await supabase
    .from("scan_sessions")
    .select("status")
    .eq("id", sessionId)
    .single();

  if (!session) return fail("not_found", "Scan session not found.", 404);
  if (session.status !== "consented" && session.status !== "recording") {
    return fail("invalid_state", "Scan is not in a recordable state.", 409);
  }

  const { error } = await supabase
    .from("scan_sessions")
    .update({
      status: "recording",
      recording_started_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  if (error) {
    logger.error("recording_started_failed", { sessionId, error: error.message });
    return internalError("Could not update the scan state.");
  }

  return ok({ sessionId });
}
