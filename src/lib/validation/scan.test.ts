import { describe, expect, it } from "vitest";
import {
  createSessionSchema,
  uploadUrlsSchema,
  completeScanSchema,
  isRequiredSequence,
  hasCaptureForEveryStep,
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

  it("accepts per-direction upload slots", () => {
    const r = uploadUrlsSchema.safeParse({
      captures: ["CENTER", "LEFT", "RIGHT"].map((step) => ({
        step,
        video: { mimeType: "video/webm", byteSize: 100, extension: "webm" },
        frame: { mimeType: "image/jpeg", byteSize: 10, extension: "jpg" },
      })),
    });
    // Schema is structural; size limits are enforced in the route.
    expect(r.success).toBe(true);
  });

  it("rejects upload slots for a removed direction", () => {
    const r = uploadUrlsSchema.safeParse({
      captures: [
        {
          step: "UP",
          video: { mimeType: "video/webm", byteSize: 100, extension: "webm" },
          frame: { mimeType: "image/jpeg", byteSize: 10, extension: "jpg" },
        },
      ],
    });
    expect(r.success).toBe(false);
  });

  const captures = ["CENTER", "LEFT", "RIGHT"].map((step) => ({
    step,
    video: { objectKey: `${step}-v`, mimeType: "video/webm", byteSize: 100 },
    frame: { objectKey: `${step}-f`, mimeType: "image/jpeg", byteSize: 10, width: 100, height: 100 },
  }));

  const steps = [
    { step: "CENTER", stepOrder: 1, passed: true, holdMs: 900, yaw: 0, pitch: 0, roll: 0, frameTimestampMs: 0 },
    { step: "LEFT", stepOrder: 2, passed: true, holdMs: 900, yaw: -25, pitch: 0, roll: 0, frameTimestampMs: 0 },
    { step: "RIGHT", stepOrder: 3, passed: true, holdMs: 900, yaw: 25, pitch: 0, roll: 0, frameTimestampMs: 0 },
  ];

  const qualitySummary = {
    minimumFaceCount: 1,
    maximumFaceCount: 1,
    averageBrightness: 0.5,
    bestSharpness: 0.8,
  };

  it("accepts a complete payload with all three captures", () => {
    const r = completeScanSchema.safeParse({
      durationMs: 10000,
      captures,
      analysisStep: "CENTER",
      steps,
      qualitySummary,
    });
    expect(r.success).toBe(true);
  });

  it("rejects a complete payload missing a direction", () => {
    const r = completeScanSchema.safeParse({
      durationMs: 10000,
      captures: captures.slice(0, 2),
      analysisStep: "CENTER",
      steps,
      qualitySummary,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a complete payload whose steps contain a removed direction", () => {
    const r = completeScanSchema.safeParse({
      durationMs: 10000,
      captures,
      analysisStep: "CENTER",
      steps: [
        ...steps,
        { step: "UP", stepOrder: 3, passed: true, holdMs: 100, yaw: 0, pitch: -20, roll: 0, frameTimestampMs: 0 },
      ],
      qualitySummary,
    });
    expect(r.success).toBe(false);
  });
});

describe("hasCaptureForEveryStep", () => {
  it("accepts one capture per direction", () => {
    expect(
      hasCaptureForEveryStep([{ step: "CENTER" }, { step: "LEFT" }, { step: "RIGHT" }])
    ).toBe(true);
  });

  it("rejects duplicates", () => {
    expect(
      hasCaptureForEveryStep([{ step: "CENTER" }, { step: "CENTER" }, { step: "LEFT" }])
    ).toBe(false);
  });

  it("rejects a missing direction", () => {
    expect(hasCaptureForEveryStep([{ step: "CENTER" }, { step: "LEFT" }])).toBe(false);
  });
});

describe("isRequiredSequence", () => {
  const valid = ["CENTER", "LEFT", "RIGHT"].map((step, i) => ({
    step,
    stepOrder: i + 1,
    passed: true,
  }));

  it("accepts the exact required sequence", () => {
    expect(isRequiredSequence(valid)).toBe(true);
  });

  it("rejects a failed step", () => {
    const bad = valid.map((s, i) => (i === 1 ? { ...s, passed: false } : s));
    expect(isRequiredSequence(bad)).toBe(false);
  });

  it("rejects wrong order", () => {
    const bad = [...valid].reverse();
    expect(isRequiredSequence(bad)).toBe(false);
  });

  it("rejects a removed direction", () => {
    const bad = [...valid.slice(0, 2), { step: "UP", stepOrder: 3, passed: true }];
    expect(isRequiredSequence(bad)).toBe(false);
  });

  it("rejects wrong step count", () => {
    expect(isRequiredSequence(valid.slice(0, 2))).toBe(false);
  });
});
