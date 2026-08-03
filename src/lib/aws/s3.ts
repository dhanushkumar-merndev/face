import {
  S3Client,
  DeleteObjectsCommand,
  HeadObjectCommand,
  ObjectIdentifier,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

let s3Client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.AWS_REGION ?? "ap-south-1",
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

/** Server-generated object key. The client never supplies a key. */
export function buildObjectKey(
  sessionId: string,
  kind: "video" | "best_frame" | "thumbnail" | "telemetry",
  extension: string
): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const tenantId = "default";
  // Sanitize so a session id can never introduce path traversal into a key.
  const safeSessionId = sessionId.replace(/[^a-zA-Z0-9-]/g, "");
  const file =
    kind === "video"
      ? `original.${extension}`
      : kind === "best_frame"
        ? "best-frame.jpg"
        : kind === "thumbnail"
          ? "thumbnail.jpg"
          : `telemetry.json.gz`;
  return `face-scans/${tenantId}/${yyyy}/${mm}/${safeSessionId}/${file}`;
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
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: objectKey,
    ContentType: contentType,
  });
  const url = await getSignedUrl(getS3Client(), command, { expiresIn: ttlSeconds });
  return {
    url,
    objectKey,
    headers: { "Content-Type": contentType },
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
