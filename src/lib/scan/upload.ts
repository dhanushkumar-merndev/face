import type { ChallengeStep } from "@/lib/face/types";
import type { PresignedSlot } from "./api";

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

/** One direction's video segment and still frame, with their upload slots. */
export interface CaptureUpload {
  step: ChallengeStep;
  video: { blob: Blob; presign: PresignedSlot };
  frame: { blob: Blob; presign: PresignedSlot };
}

export interface CaptureUploadResult {
  step: ChallengeStep;
  videoEtag: string | null;
  frameEtag: string | null;
}

/**
 * Uploads every direction's pair, reporting progress as each object lands so
 * the scanner can drive its upload meter.
 */
export async function uploadCaptures(
  captures: CaptureUpload[],
  onProgress?: (uploaded: number, total: number) => void
): Promise<CaptureUploadResult[]> {
  const total = captures.length * 2;
  let uploaded = 0;

  const results: CaptureUploadResult[] = [];

  for (const capture of captures) {
    const video = await uploadToS3(
      capture.video.presign.url,
      capture.video.blob,
      capture.video.presign.headers
    );
    uploaded += 1;
    onProgress?.(uploaded, total);

    const frame = await uploadToS3(
      capture.frame.presign.url,
      capture.frame.blob,
      capture.frame.presign.headers
    );
    uploaded += 1;
    onProgress?.(uploaded, total);

    results.push({ step: capture.step, videoEtag: video.etag, frameEtag: frame.etag });
  }

  return results;
}
