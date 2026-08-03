import type { UploadUrlsResult } from "./api";

/** Uploads a Blob directly to a presigned S3 PUT URL. */
export async function uploadToS3(
  url: string,
  blob: Blob,
  headers: Record<string, string>
): Promise<{ etag: string | null }> {
  const res = await fetch(url, {
    method: "PUT",
    headers,
    body: blob,
  });

  if (!res.ok) {
    throw new Error(`Upload failed with status ${res.status}.`);
  }

  const etag = res.headers.get("etag");
  return { etag };
}

export interface UploadBundle {
  video: { blob: Blob; presign: UploadUrlsResult["video"] };
  bestFrame: { blob: Blob; presign: UploadUrlsResult["bestFrame"] };
  thumbnail?: { blob: Blob; presign: NonNullable<UploadUrlsResult["thumbnail"]> };
}

export async function uploadAll(bundle: UploadBundle): Promise<{
  videoEtag: string | null;
  bestFrameEtag: string | null;
}> {
  const video = await uploadToS3(
    bundle.video.presign.url,
    bundle.video.blob,
    bundle.video.presign.headers
  );
  const bestFrame = await uploadToS3(
    bundle.bestFrame.presign.url,
    bundle.bestFrame.blob,
    bundle.bestFrame.presign.headers
  );

  if (bundle.thumbnail) {
    await uploadToS3(
      bundle.thumbnail.presign.url,
      bundle.thumbnail.blob,
      bundle.thumbnail.presign.headers
    );
  }

  return { videoEtag: video.etag, bestFrameEtag: bestFrame.etag };
}
