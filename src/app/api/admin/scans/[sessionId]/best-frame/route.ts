import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/admin";
import { fail } from "@/lib/api/respond";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createPlaybackUrl } from "@/lib/aws/s3";

/** Serves the best frontal frame via a 302 redirect to a short-lived signed URL. */
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
  const url = new URL(req.url);
  // Defaults to the frontal capture; ?step=LEFT|RIGHT serves the other views.
  const step = (url.searchParams.get("step") ?? "CENTER").toUpperCase();
  if (!["CENTER", "LEFT", "RIGHT"].includes(step)) {
    return fail("invalid_step", "Unknown capture direction.", 400);
  }

  const supabase = getSupabaseAdmin();

  const { data: assets } = await supabase
    .from("scan_assets")
    .select("object_key, step")
    .eq("session_id", sessionId)
    .eq("kind", "best_frame");

  // Legacy sessions predate per-step assets and have a null step.
  const asset =
    assets?.find((a) => a.step === step) ?? (step === "CENTER" ? assets?.[0] : undefined);

  if (!asset) return fail("not_found", "No frame found for that direction.", 404);

  const signed = await createPlaybackUrl(asset.object_key, 60);
  return NextResponse.redirect(signed);
}
