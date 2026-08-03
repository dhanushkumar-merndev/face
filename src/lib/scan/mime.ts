import { MIME_CANDIDATES } from "@/lib/face/config";

/**
 * MediaRecorder MIME selection with fallback.
 * Returns the first candidate supported by the browser, or null when none are
 * explicitly supported (caller then creates MediaRecorder without options).
 */
export function pickMimeType(isTypeSupported: (mime: string) => boolean): string | null {
  for (const mime of MIME_CANDIDATES) {
    if (isTypeSupported(mime)) return mime;
  }
  return null;
}

export function extensionForMime(mime: string | null): string {
  if (!mime) return "webm";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogv";
  return "webm";
}

export function isSupportedMimeForUpload(mime: string): boolean {
  return MIME_CANDIDATES.includes(mime as (typeof MIME_CANDIDATES)[number]);
}
