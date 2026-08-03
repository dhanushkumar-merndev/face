import { describe, expect, it } from "vitest";
import { pickMimeType, extensionForMime, isSupportedMimeForUpload } from "@/lib/scan/mime";
import { buildObjectKey } from "@/lib/aws/s3";

describe("MIME selection", () => {
  it("picks the first supported candidate", () => {
    const supported = (m: string) => m.includes("vp8");
    expect(pickMimeType(supported)).toBe("video/webm;codecs=vp8");
  });

  it("returns null when nothing is supported", () => {
    expect(pickMimeType(() => false)).toBeNull();
  });

  it("falls back through the order", () => {
    const supported = (m: string) => m === "video/webm";
    expect(pickMimeType(supported)).toBe("video/webm");
  });

  it("maps MIME to extension", () => {
    expect(extensionForMime("video/webm;codecs=vp8")).toBe("webm");
    expect(extensionForMime("video/mp4")).toBe("mp4");
    expect(extensionForMime(null)).toBe("webm");
  });

  it("validates allowed upload MIMEs", () => {
    expect(isSupportedMimeForUpload("video/webm;codecs=vp8")).toBe(true);
    expect(isSupportedMimeForUpload("video/avi")).toBe(false);
  });
});

describe("S3 key generation", () => {
  it("generates a server-owned key with the tenant prefix", () => {
    const key = buildObjectKey("abc-123", "video", "webm");
    expect(key).toMatch(/^face-scans\/default\/\d{4}\/\d{2}\/abc-123\/original\.webm$/);
  });

  it("uses frame.jpg scoped to the step for the best frame", () => {
    const key = buildObjectKey("abc-123", "best_frame", "jpg", "CENTER");
    expect(key).toMatch(/\/center\/frame\.jpg$/);
  });

  it("uses thumbnail.jpg for thumbnails", () => {
    const key = buildObjectKey("abc-123", "thumbnail", "jpg");
    expect(key).toMatch(/thumbnail\.jpg$/);
  });

  it("never accepts a client-provided key shape", () => {
    // buildObjectKey is the only generator; a client-supplied key can never
    // be passed to it (keys are always derived from sessionId + kind).
    const key = buildObjectKey("session/../evil", "video", "webm");
    expect(key).not.toContain("../");
  });
});
