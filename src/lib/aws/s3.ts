import {
  S3Client,
  DeleteObjectsCommand,
  HeadObjectCommand,
  ObjectIdentifier,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

let s3Client: S3Client | null = null;

/**
 * S3 client. Defaults to AWS S3; set TIGRIS_ENDPOINT (e.g.
 * https://t3.storage.dev) to use Tigris Data's S3-compatible storage.
 * Tigris requires region "auto" and virtual-hosted-style addressing.
 */
export function getS3Client(): S3Client {
  if (!s3Client) {
    const tigrisEndpoint = process.env.TIGRIS_ENDPOINT;
    const useTigris = Boolean(tigrisEndpoint);
    s3Client = new S3Client({
      region: useTigris ? "auto" : (process.env.AWS_REGION ?? "ap-south-1"),
      ...(tigrisEndpoint ? { endpoint: tigrisEndpoint } : {}),
      ...(useTigris ? { forcePathStyle: false } : {}),
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
      },
    });
  }
  return s3Client;
}

export function getBucket(): string {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) throw new Error("AWS_S3_BUCKET is not configured.");
  return bucket;
}

/**
 * Server-generated object key. The client never supplies a key.
 *
 * `step` scopes the object to one capture direction, so a session holds
 * `center/`, `left/` and `right/` folders each with its own video + frame.
 */
export function buildObjectKey(
  sessionId: string,
  kind: "video" | "best_frame" | "thumbnail" | "telemetry",
  extension: string,
  step?: string
): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const tenantId = "default";
  // Sanitize so neither value can introduce path traversal into a key.
  const safeSessionId = sessionId.replace(/[^a-zA-Z0-9-]/g, "");
  const safeStep = step ? step.toLowerCase().replace(/[^a-z0-9-]/g, "") : "";
  const file =
    kind === "video"
      ? `original.${extension.replace(/[^a-z0-9]/gi, "")}`
      : kind === "best_frame"
        ? "frame.jpg"
        : kind === "thumbnail"
          ? "thumbnail.jpg"
          : `telemetry.json.gz`;
  const prefix = `face-scans/${tenantId}/${yyyy}/${mm}/${safeSessionId}`;
  return safeStep ? `${prefix}/${safeStep}/${file}` : `${prefix}/${file}`;
}

export type PresignedUpload = {
  url: string;
  objectKey: string;
  headers: Record<string, string>;
};

export async function createPresignedUpload(
  objectKey: string,
  contentType: string,
  ttlSeconds = 300
): Promise<PresignedUpload> {
  // Strip codec parameters (e.g. "video/webm;codecs=vp9" -> "video/webm") so
  // S3 signature matches standard browser fetch headers exactly.
  const baseContentType = contentType.split(";")[0].trim();
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: objectKey,
    ContentType: baseContentType,
  });
  const url = await getSignedUrl(getS3Client(), command, { expiresIn: ttlSeconds });
  return {
    url,
    objectKey,
    headers: { "Content-Type": baseContentType },
  };
}

export type ObjectHead = {
  exists: boolean;
  contentType?: string;
  contentLength?: number;
  etag?: string;
};

export async function headObject(objectKey: string): Promise<ObjectHead> {
  try {
    const res = await getS3Client().send(
      new HeadObjectCommand({ Bucket: getBucket(), Key: objectKey })
    );
    return {
      exists: true,
      contentType: res.ContentType,
      contentLength: res.ContentLength,
      etag: res.ETag?.replace(/"/g, ""),
    };
  } catch (err) {
    const code = (err as { name?: string }).name;
    if (code === "NotFound" || code === "NoSuchKey" || code === "403") {
      return { exists: false };
    }
    throw err;
  }
}

export async function createPlaybackUrl(objectKey: string, ttlSeconds = 120): Promise<string> {
  const command = new GetObjectCommand({ Bucket: getBucket(), Key: objectKey });
  return getSignedUrl(getS3Client(), command, { expiresIn: ttlSeconds });
}

/**
 * Fetches an object's bytes. Used to hand the best frame to Rekognition
 * (Rekognition can only read from real AWS S3, so when storage is Tigris the
 * frame is fetched here and passed as Image.Bytes).
 */
export async function getObjectBytes(objectKey: string): Promise<Uint8Array> {
  const res = await getS3Client().send(
    new GetObjectCommand({ Bucket: getBucket(), Key: objectKey })
  );
  const stream = res.Body;
  if (!stream) throw new Error("Object body is empty.");

  const chunks: Uint8Array[] = [];
  for await (const chunk of stream as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

export async function deleteObjects(objectKeys: string[]): Promise<void> {
  const bucket = getBucket();
  const keys = objectKeys.filter(Boolean);
  if (keys.length === 0) return;

  const identifiers: ObjectIdentifier[] = keys.map((key) => ({ Key: key }));
  await getS3Client().send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: identifiers, Quiet: true },
    })
  );
}

export async function s3ObjectUrl(key: string): Promise<string> {
  return `s3://${getBucket()}/${key}`;
}
