import type { ChallengeStep } from "@/lib/face/types";
import type { PresignedSlot } from "./api";

/** Uploads a Blob directly to presigned S3 PUT URL with proxy fallback on CORS/network failure. */
export async function uploadToS3(
  url: string,
  blob: Blob,
  headers: Record<string, string>,
  sessionId?: string,
  objectKey?: string,
  retries = 2
): Promise<{ etag: string | null }> {
  let lastError: Error | null = null;

  // 1. Try direct S3 upload
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const res = await fetch(url, {
        method: "PUT",
        headers,
        body: blob,
      });

      if (res.ok) {
        const etag = res.headers.get("etag");
        return { etag };
      }

      throw new Error(`Upload failed with status ${res.status}.`);
    } catch (err) {
      lastError = err as Error;
      if (attempt < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300 * Math.pow(2, attempt)));
      }
    }
  }

  // 2. If direct S3 upload fails (e.g. CORS "Failed to fetch" on mobile), fallback to server proxy
  if (sessionId && objectKey) {
    try {
      const formData = new FormData();
      formData.append("file", blob);
      formData.append("objectKey", objectKey);
      formData.append("contentType", headers["Content-Type"] || blob.type || "application/octet-stream");

      const proxyRes = await fetch(`/api/scans/${sessionId}/upload-proxy`, {
        method: "POST",
        body: formData,
      });

      if (proxyRes.ok) {
        const json = await proxyRes.json();
        if (json.success) {
          return { etag: json.data.etag };
        }
      }
    } catch (proxyErr) {
      console.warn("Proxy upload fallback failed:", proxyErr);
    }
  }

  throw lastError ?? new Error("Upload failed.");
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
 * Uploads every direction's pair, reporting progress as each object lands.
 */
export async function uploadCaptures(
  captures: CaptureUpload[],
  sessionId?: string,
  onProgress?: (uploaded: number, total: number) => void
): Promise<CaptureUploadResult[]> {
  const total = captures.length * 2;
  let uploaded = 0;

  const results: CaptureUploadResult[] = [];

  for (const capture of captures) {
    const video = await uploadToS3(
      capture.video.presign.url,
      capture.video.blob,
      capture.video.presign.headers,
      sessionId,
      capture.video.presign.objectKey
    );
    uploaded += 1;
    onProgress?.(uploaded, total);

    const frame = await uploadToS3(
      capture.frame.presign.url,
      capture.frame.blob,
      capture.frame.presign.headers,
      sessionId,
      capture.frame.presign.objectKey
    );
    uploaded += 1;
    onProgress?.(uploaded, total);

    results.push({ step: capture.step, videoEtag: video.etag, frameEtag: frame.etag });
  }

  return results;
}
