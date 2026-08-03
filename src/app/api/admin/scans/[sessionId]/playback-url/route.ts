import { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/auth/admin";
import { ok, fail, internalError } from "@/lib/api/respond";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createPlaybackUrl } from "@/lib/aws/s3";
import { logger } from "@/lib/logger";

const PLAYBACK_TTL = Number(process.env.SCAN_PLAYBACK_URL_TTL_SECONDS ?? 120);

export async function POST(
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

  const { data: asset } = await supabase
    .from("scan_assets")
    .select("object_key, kind")
    .eq("session_id", sessionId)
    .eq("kind", "video")
    .maybeSingle();

  if (!asset) return fail("not_found", "No video asset found for this scan.", 404);

  try {
    const url = await createPlaybackUrl(asset.object_key, PLAYBACK_TTL);
    await supabase.from("scan_audit_events").insert({
      session_id: sessionId,
      actor_user_id: admin.userId,
      event_type: "video_playback_requested",
      event_data: {},
    });
    return ok({ url, expiresIn: PLAYBACK_TTL });
  } catch (err) {
    logger.error("playback_url_failed", { sessionId, error: (err as Error).message });
    return internalError("Could not generate a playback URL.");
  }
}
