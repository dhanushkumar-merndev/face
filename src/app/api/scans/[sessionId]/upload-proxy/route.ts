import { NextRequest } from "next/server";
import { resolveSessionFromRequest } from "@/lib/auth/session-guard";
import { getS3Client, getBucket } from "@/lib/aws/s3";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { ok, fail, internalError } from "@/lib/api/respond";
import { logger } from "@/lib/logger";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  const resolved = await resolveSessionFromRequest(req, sessionId);
  if (!resolved) {
    return fail("unauthorized", "This scan session is not accessible.", 401);
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const objectKey = formData.get("objectKey") as string | null;
    const contentType = (formData.get("contentType") as string | null) || "application/octet-stream";

    if (!file || !objectKey) {
      return fail("bad_request", "Missing file or objectKey.");
    }

    // Security check: ensure objectKey is scoped to this sessionId
    if (!objectKey.includes(sessionId.replace(/[^a-zA-Z0-9-]/g, ""))) {
      return fail("forbidden", "Invalid objectKey for session.", 403);
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const baseContentType = contentType.split(";")[0].trim();

    const command = new PutObjectCommand({
      Bucket: getBucket(),
      Key: objectKey,
      Body: buffer,
      ContentType: baseContentType,
    });

    const res = await getS3Client().send(command);

    return ok({ etag: res.ETag?.replace(/"/g, "") ?? null });
  } catch (err) {
    logger.error("upload_proxy_failed", { sessionId, error: (err as Error).message });
    return internalError("Proxy upload failed.");
  }
}
