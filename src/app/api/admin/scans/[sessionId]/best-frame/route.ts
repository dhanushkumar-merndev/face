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
  const supabase = getSupabaseAdmin();

  const { data: asset } = await supabase
    .from("scan_assets")
    .select("object_key")
    .eq("session_id", sessionId)
    .eq("kind", "best_frame")
    .maybeSingle();

  if (!asset) return fail("not_found", "No best frame found.", 404);

  const url = await createPlaybackUrl(asset.object_key, 60);
  return NextResponse.redirect(url);
}
