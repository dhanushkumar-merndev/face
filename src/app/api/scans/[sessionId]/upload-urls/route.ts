import { NextRequest } from "next/server";
import { uploadUrlsSchema } from "@/lib/validation/scan";
import { fromZodError, ok, fail, internalError } from "@/lib/api/respond";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveSessionFromRequest } from "@/lib/auth/session-guard";
import { buildObjectKey, createPresignedUpload } from "@/lib/aws/s3";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/security/rate-limit";

const MAX_VIDEO_BYTES = Number(process.env.SCAN_MAX_VIDEO_BYTES ?? 30 * 1024 * 1024);
const MAX_IMAGE_BYTES = Number(process.env.SCAN_MAX_IMAGE_BYTES ?? 5 * 1024 * 1024);
const UPLOAD_URL_TTL = Number(process.env.SCAN_UPLOAD_URL_TTL_SECONDS ?? 300);

const ALLOWED_VIDEO_MIMES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/mp4;codecs=h264",
  "video/mp4",
  "video/webm",
];
const ALLOWED_IMAGE_MIMES = ["image/jpeg"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  const resolved = await resolveSessionFromRequest(req, sessionId);
  if (!resolved) {
    return fail("unauthorized", "This scan session is not accessible from this browser.", 401);
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimit(`upload-urls:${ip}`, 20);
  if (!rl.allowed) {
    return fail("rate_limited", "Too many upload requests. Please try again later.", 429);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("invalid_json", "Request body is not valid JSON.");
  }

  const parsed = uploadUrlsSchema.safeParse(body);
  if (!parsed.success) return fromZodError(parsed.error);

  const { captures } = parsed.data;

  // Validate MIME + size for every direction's pair.
  for (const capture of captures) {
    if (!ALLOWED_VIDEO_MIMES.includes(capture.video.mimeType)) {
      return fail("invalid_mime", "The video MIME type is not allowed.");
    }
    if (capture.video.byteSize > MAX_VIDEO_BYTES || capture.video.byteSize < 1) {
      return fail("invalid_size", "The video size is outside the allowed range.");
    }
    if (!ALLOWED_IMAGE_MIMES.includes(capture.frame.mimeType)) {
      return fail("invalid_mime", "The image MIME type is not allowed.");
    }
    if (capture.frame.byteSize > MAX_IMAGE_BYTES || capture.frame.byteSize < 1) {
      return fail("invalid_size", "The image size is outside the allowed range.");
    }
  }

  const supabase = getSupabaseAdmin();
  const { data: session } = await supabase
    .from("scan_sessions")
    .select("status")
    .eq("id", sessionId)
    .single();

  if (!session) return fail("not_found", "Scan session not found.", 404);
  if (!["recording", "uploading"].includes(session.status)) {
    return fail("invalid_state", "Scan is not in an uploadable state.", 409);
  }

  try {
    // Server-owned keys only, namespaced per direction.
    const presigned = await Promise.all(
      captures.map(async (capture) => {
        const [videoPresign, framePresign] = await Promise.all([
          createPresignedUpload(
            buildObjectKey(sessionId, "video", capture.video.extension, capture.step),
            capture.video.mimeType,
            UPLOAD_URL_TTL
          ),
          createPresignedUpload(
            buildObjectKey(sessionId, "best_frame", "jpg", capture.step),
            capture.frame.mimeType,
            UPLOAD_URL_TTL
          ),
        ]);
        return { step: capture.step, video: videoPresign, frame: framePresign };
      })
    );

    await supabase
      .from("scan_sessions")
      .update({ status: "uploading" })
      .eq("id", sessionId);

    return ok({ captures: presigned });
  } catch (err) {
    logger.error("upload_urls_failed", { sessionId, error: (err as Error).message });
    return internalError("Could not generate upload URLs.");
  }
}
