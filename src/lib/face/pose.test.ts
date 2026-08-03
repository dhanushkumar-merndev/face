import { describe, expect, it } from "vitest";
import { matrixToHeadPose, mirroredYaw } from "@/lib/face/pose";

/**
 * The extraction uses (row-major 4x4 flattened):
 *   yaw  = atan2(m[2], m[10])   -> row 0 col 2, row 2 col 2
 *   roll = atan2(m[4], m[5])    -> row 1 col 0, row 1 col 1
 *
 * We construct matrices whose entries satisfy these relations for known
 * angles, then verify the extraction returns those angles.
 */

const IDENTITY = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];

/** Pure yaw rotation: yaw = atan2(sin, cos) with pitch=roll=0. */
function pureYaw(yawDeg: number): number[] {
  const a = (yawDeg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    c, 0, s, 0,
    0, 1, 0, 0,
    -s, 0, c, 0,
    0, 0, 0, 1,
  ];
}

/** Pure roll rotation: roll = atan2(sin, cos) with yaw=pitch=0. */
function pureRoll(rollDeg: number): number[] {
  const a = (rollDeg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    1, 0, 0, 0,
    s, c, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
}

describe("matrixToHeadPose", () => {
  it("returns zero pose for the identity matrix", () => {
    const pose = matrixToHeadPose(IDENTITY);
    expect(pose.yaw).toBeCloseTo(0, 5);
    expect(pose.pitch).toBeCloseTo(0, 5);
    expect(pose.roll).toBeCloseTo(0, 5);
  });

  it("detects a pure yaw rotation", () => {
    const pose = matrixToHeadPose(pureYaw(20));
    expect(pose.yaw).toBeCloseTo(20, 5);
    expect(Math.abs(pose.pitch)).toBeLessThan(1e-6);
    expect(Math.abs(pose.roll)).toBeLessThan(1e-6);
  });

  it("detects a pure roll rotation", () => {
    const pose = matrixToHeadPose(pureRoll(20));
    expect(pose.roll).toBeCloseTo(20, 5);
    expect(Math.abs(pose.yaw)).toBeLessThan(1e-6);
    expect(Math.abs(pose.pitch)).toBeLessThan(1e-6);
  });

  it("handles a 16-length array and returns finite numbers", () => {
    const pose = matrixToHeadPose(new Array(16).fill(0).map((_, i) => (i % 5) / 10));
    expect(Number.isFinite(pose.yaw)).toBe(true);
    expect(Number.isFinite(pose.pitch)).toBe(true);
    expect(Number.isFinite(pose.roll)).toBe(true);
  });
});

describe("mirroredYaw", () => {
  it("inverts yaw for mirrored display", () => {
    expect(mirroredYaw(20)).toBe(-20);
    expect(mirroredYaw(-20)).toBe(20);
  });
});
