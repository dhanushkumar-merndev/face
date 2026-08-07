import { NextRequest } from "next/server";
import JSZip from "jszip";
import { requireAdminSession } from "@/lib/auth/admin";
import { fail, internalError } from "@/lib/api/respond";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getObjectBytes } from "@/lib/aws/s3";
import { logger } from "@/lib/logger";

/** Capture order, so the archive reads the way the scan was recorded. */
const STEP_ORDER = ["CENTER", "LEFT", "RIGHT"];

/** Extension by mime type; the stored key is not always suffixed usefully. */
function extensionFor(mimeType: string, kind: string): string {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  return kind === "video" ? "webm" : "jpg";
}

/**
 * Bundles every clip and frame for one scan into a single ZIP. Media is stored
 * already-compressed, so entries go in uncompressed — the CPU spent deflating a
 * webm buys nothing.
 */
export async function GET(
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

  const { data: scan } = await supabase
    .from("scan_sessions")
    .select("id, status")
    .eq("id", sessionId)
    .single();

  if (!scan) return fail("not_found", "Scan session not found.", 404);
  if (scan.status === "deleted") {
    return fail("gone", "Media for this scan has been deleted.", 410);
  }

  const { data: assets } = await supabase
    .from("scan_assets")
    .select("object_key, kind, step, mime_type")
    .eq("session_id", sessionId);

  if (!assets || assets.length === 0) {
    return fail("not_found", "No media found for this scan.", 404);
  }

  const sorted = [...assets].sort((a, b) => {
    const byStep =
      STEP_ORDER.indexOf(a.step ?? "CENTER") - STEP_ORDER.indexOf(b.step ?? "CENTER");
    return byStep !== 0 ? byStep : (a.kind ?? "").localeCompare(b.kind ?? "");
  });

  try {
    const zip = new JSZip();
    const folder = zip.folder(`scan-${sessionId.slice(0, 8)}`) ?? zip;

    const files = await Promise.all(
      sorted.map(async (asset) => ({
        name: `${(asset.step ?? "unknown").toLowerCase()}-${
          asset.kind === "best_frame" ? "frame" : asset.kind
        }.${extensionFor(asset.mime_type ?? "", asset.kind ?? "")}`,
        bytes: await getObjectBytes(asset.object_key),
      }))
    );

    for (const file of files) {
      folder.file(file.name, file.bytes);
    }

    const archive = await zip.generateAsync({ type: "uint8array", compression: "STORE" });

    await supabase.from("scan_audit_events").insert({
      session_id: sessionId,
      actor_user_id: admin.userId,
      event_type: "media_downloaded",
      event_data: { files: files.length },
    });

    logger.info("scan_media_downloaded", { sessionId, files: files.length });

    return new Response(archive as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(archive.byteLength),
        "Content-Disposition": `attachment; filename="scan-${sessionId.slice(0, 8)}.zip"`,
        // Signed media must never sit in a shared cache.
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    logger.error("scan_download_failed", { sessionId, error: (err as Error).message });
    return internalError("Could not build the download archive.");
  }
}
