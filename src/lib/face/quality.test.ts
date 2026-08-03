import { describe, expect, it } from "vitest";
import {
  centerCondition,
  leftCondition,
  rightCondition,
  upCondition,
  evaluateQuality,
} from "@/lib/face/quality";
import type { HeadPose, FaceInfo } from "@/lib/face/types";

const baseFace: FaceInfo = {
  confidence: 0.99,
  box: { x: 200, y: 150, width: 300, height: 400 },
  landmarks: [],
};

// 1000x800 frame; face box area = 120000 = 0.15 of frame (within 0.12-0.58),
// centered (center at 350,350 vs frame center 500,400 -> offset x 0.15, y 0.0625).
const frameWidth = 1000;
const frameHeight = 800;

function input(pose: HeadPose, face = baseFace, qualityOk = true, faceCount = 1) {
  return { pose, face, frameWidth, frameHeight, faceCount, qualityOk };
}

describe("step predicates", () => {
  it("center passes with a neutral pose", () => {
    expect(centerCondition(input({ yaw: 0, pitch: 0, roll: 0 }))).toBe(true);
  });

  it("center fails when yaw exceeds threshold", () => {
    expect(centerCondition(input({ yaw: 15, pitch: 0, roll: 0 }))).toBe(false);
  });

  it("center fails when quality is bad", () => {
    expect(centerCondition(input({ yaw: 0, pitch: 0, roll: 0 }, baseFace, false))).toBe(false);
  });

  it("left passes with strongly negative yaw", () => {
    expect(leftCondition(input({ yaw: -25, pitch: 0, roll: 0 }))).toBe(true);
  });

  it("left fails with positive yaw", () => {
    expect(leftCondition(input({ yaw: 25, pitch: 0, roll: 0 }))).toBe(false);
  });

  it("right passes with strongly positive yaw", () => {
    expect(rightCondition(input({ yaw: 25, pitch: 0, roll: 0 }))).toBe(true);
  });

  it("right fails with negative yaw", () => {
    expect(rightCondition(input({ yaw: -25, pitch: 0, roll: 0 }))).toBe(false);
  });

  it("up passes with negative pitch (looking up convention)", () => {
    expect(upCondition(input({ yaw: 0, pitch: -20, roll: 0 }))).toBe(true);
  });

  it("up fails when pitch is positive or neutral", () => {
    expect(upCondition(input({ yaw: 0, pitch: 0, roll: 0 }))).toBe(false);
    expect(upCondition(input({ yaw: 0, pitch: 20, roll: 0 }))).toBe(false);
  });
});

describe("evaluateQuality", () => {
  it("rejects zero faces", () => {
    const r = evaluateQuality({ faceCount: 0, frameWidth, frameHeight });
    expect(r.ok).toBe(false);
    expect(r.message).toBe("no_face");
  });

  it("rejects multiple faces", () => {
    const r = evaluateQuality({ faceCount: 2, frameWidth, frameHeight });
    expect(r.ok).toBe(false);
    expect(r.message).toBe("multiple_faces");
  });

  it("accepts a valid single face", () => {
    const r = evaluateQuality({ faceCount: 1, face: baseFace, frameWidth, frameHeight });
    expect(r.ok).toBe(true);
  });

  it("rejects bad lighting", () => {
    const r = evaluateQuality({
      faceCount: 1,
      face: baseFace,
      frameWidth,
      frameHeight,
      luminance: 0.05,
    });
    expect(r.ok).toBe(false);
    expect(r.message).toBe("improve_lighting");
  });

  it("rejects excessive blur", () => {
    const r = evaluateQuality({
      faceCount: 1,
      face: baseFace,
      frameWidth,
      frameHeight,
      sharpness: 0.001,
    });
    expect(r.ok).toBe(false);
    expect(r.message).toBe("hold_steady");
  });
});
