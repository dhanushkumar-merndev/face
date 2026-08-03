import { describe, expect, it } from "vitest";
import {
  frontalScore,
  centeredScore,
  faceSizeScore,
  computeFrameScore,
} from "@/lib/face/frame-score";
import type { FaceInfo } from "@/lib/face/types";

const face: FaceInfo = {
  confidence: 1,
  box: { x: 350, y: 200, width: 300, height: 400 },
  landmarks: [],
};

describe("frame scoring", () => {
  it("frontalScore is 1 for a perfectly frontal pose", () => {
    expect(frontalScore({ yaw: 0, pitch: 0, roll: 0 })).toBe(1);
  });

  it("frontalScore decays with yaw", () => {
    const s = frontalScore({ yaw: 15, pitch: 0, roll: 0 });
    expect(s).toBeLessThan(1);
    expect(s).toBeGreaterThan(0.5);
  });

  it("centeredScore is 1 for a centered face", () => {
    const centered: FaceInfo = { ...face, box: { x: 350, y: 200, width: 300, height: 400 } };
    expect(centeredScore(centered, 1000, 800)).toBeCloseTo(1, 3);
  });

  it("faceSizeScore prefers mid-band sizes", () => {
    // Frame 1000x800 -> area 800000; face area 120000 -> ratio 0.15 (preferred band ~0.35).
    const s = faceSizeScore(face, 800000);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThanOrEqual(1);
  });

  it("computeFrameScore returns 0 when quality fails", () => {
    const score = computeFrameScore({
      pose: { yaw: 0, pitch: 0, roll: 0 },
      face,
      frameWidth: 1000,
      frameHeight: 800,
      quality: { ok: false, message: "multiple_faces" },
      sharpness: 0.8,
      luminance: 0.5,
    });
    expect(score).toBe(0);
  });

  it("computeFrameScore ranks sharp frontal frames higher than blurred off-center ones", () => {
    const good = computeFrameScore({
      pose: { yaw: 0, pitch: 0, roll: 0 },
      face,
      frameWidth: 1000,
      frameHeight: 800,
      quality: { ok: true, message: "ok" },
      sharpness: 0.9,
      luminance: 0.5,
    });
    const bad = computeFrameScore({
      pose: { yaw: 25, pitch: 10, roll: 5 },
      face: { ...face, box: { x: 100, y: 50, width: 200, height: 260 } },
      frameWidth: 1000,
      frameHeight: 800,
      quality: { ok: true, message: "ok" },
      sharpness: 0.1,
      luminance: 0.9,
    });
    expect(good).toBeGreaterThan(bad);
  });
});
