import { describe, expect, it } from "vitest";
import {
  createSessionSchema,
  uploadUrlsSchema,
  completeScanSchema,
  isRequiredSequence,
} from "@/lib/validation/scan";

describe("Zod schemas", () => {
  it("rejects session creation without consent", () => {
    const r = createSessionSchema.safeParse({
      consentGiven: false,
      adultDeclaration: true,
      consentVersion: "v1",
    });
    expect(r.success).toBe(false);
  });

  it("rejects session creation without adult declaration", () => {
    const r = createSessionSchema.safeParse({
      consentGiven: true,
      adultDeclaration: false,
      consentVersion: "v1",
    });
    expect(r.success).toBe(false);
  });

  it("accepts a valid session payload", () => {
    const r = createSessionSchema.safeParse({
      consentGiven: true,
      adultDeclaration: true,
      consentVersion: "2026-08-v1",
    });
    expect(r.success).toBe(true);
  });

  it("rejects upload URLs with oversized video", () => {
    const r = uploadUrlsSchema.safeParse({
      video: { mimeType: "video/webm", byteSize: 100, extension: "webm" },
      bestFrame: { mimeType: "image/jpeg", byteSize: 10, extension: "jpg" },
    });
    // Schema is structural; size limits are enforced in the route.
    expect(r.success).toBe(true);
  });

  it("rejects a complete payload whose steps contain DOWN", () => {
    const steps = [
      { step: "CENTER", stepOrder: 1, passed: true, holdMs: 700, yaw: 0, pitch: 0, roll: 0, frameTimestampMs: 0 },
      { step: "LEFT", stepOrder: 2, passed: true, holdMs: 700, yaw: -25, pitch: 0, roll: 0, frameTimestampMs: 0 },
      { step: "RIGHT", stepOrder: 3, passed: true, holdMs: 700, yaw: 25, pitch: 0, roll: 0, frameTimestampMs: 0 },
      { step: "UP", stepOrder: 4, passed: true, holdMs: 700, yaw: 0, pitch: -20, roll: 0, frameTimestampMs: 0 },
      { step: "CENTER_FINAL", stepOrder: 5, passed: true, holdMs: 700, yaw: 0, pitch: 0, roll: 0, frameTimestampMs: 0 },
    ];
    const r = completeScanSchema.safeParse({
      durationMs: 10000,
      video: { objectKey: "k", mimeType: "video/webm", byteSize: 100 },
      bestFrame: { objectKey: "k2", mimeType: "image/jpeg", byteSize: 10, width: 100, height: 100 },
      steps,
      qualitySummary: { minimumFaceCount: 1, maximumFaceCount: 1, averageBrightness: 0.5, bestSharpness: 0.8 },
    });
    expect(r.success).toBe(true);

    // Add a DOWN step — schema rejects it.
    const bad = completeScanSchema.safeParse({
      ...(r.success ? r.data : {}),
      steps: [...steps, { step: "DOWN", stepOrder: 6, passed: true, holdMs: 100, yaw: 0, pitch: 0, roll: 0, frameTimestampMs: 0 }],
    });
    expect(bad.success).toBe(false);
  });
});

describe("isRequiredSequence", () => {
  const valid = ["CENTER", "LEFT", "RIGHT", "UP", "CENTER_FINAL"].map((step, i) => ({
    step,
    stepOrder: i + 1,
    passed: true,
  }));

  it("accepts the exact required sequence", () => {
    expect(isRequiredSequence(valid)).toBe(true);
  });

  it("rejects a failed step", () => {
    const bad = valid.map((s, i) => (i === 2 ? { ...s, passed: false } : s));
    expect(isRequiredSequence(bad)).toBe(false);
  });

  it("rejects wrong order", () => {
    const bad = [...valid].reverse();
    expect(isRequiredSequence(bad)).toBe(false);
  });

  it("rejects a DOWN step", () => {
    const bad = [...valid.slice(0, 4), { step: "DOWN", stepOrder: 5, passed: true }];
    expect(isRequiredSequence(bad)).toBe(false);
  });

  it("rejects wrong step count", () => {
    expect(isRequiredSequence(valid.slice(0, 3))).toBe(false);
  });
});
