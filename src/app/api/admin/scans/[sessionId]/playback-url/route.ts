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

  const { data: assets } = await supabase
    .from("scan_assets")
    .select("object_key, step")
    .eq("session_id", sessionId)
    .eq("kind", "video");

  if (!assets || assets.length === 0) {
    return fail("not_found", "No video asset found for this scan.", 404);
  }

  // One clip per direction; keep them in capture order.
  const order = ["CENTER", "LEFT", "RIGHT"];
  const sorted = [...assets].sort(
    (a, b) => order.indexOf(a.step ?? "CENTER") - order.indexOf(b.step ?? "CENTER")
  );

  try {
    const clips = await Promise.all(
      sorted.map(async (asset) => ({
        step: (asset.step ?? "CENTER") as string,
        url: await createPlaybackUrl(asset.object_key, PLAYBACK_TTL),
      }))
    );

    await supabase.from("scan_audit_events").insert({
      session_id: sessionId,
      actor_user_id: admin.userId,
      event_type: "video_playback_requested",
      event_data: { clips: clips.length },
    });

    return ok({ clips, url: clips[0].url, expiresIn: PLAYBACK_TTL });
  } catch (err) {
    logger.error("playback_url_failed", { sessionId, error: (err as Error).message });
    return internalError("Could not generate a playback URL.");
  }
}
