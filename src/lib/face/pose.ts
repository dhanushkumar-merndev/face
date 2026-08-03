import type { HeadPose } from "./types";

/**
 * Converts the MediaPipe facial transformation matrix (4x4, row-major,
 * flattened `data`) into yaw/pitch/roll Euler angles in degrees.
 *
 * MediaPipe reports the matrix in image coordinates where Y points DOWN and Z
 * points INTO the screen. Head rotations decompose as:
 *   R = Ry(yaw) · Rx(pitch) · Rz(roll)
 * which, for the row-major flattening, yields:
 *   yaw   = atan2(m[2], m[10])
 *   pitch = asin(-m[6])
 *   roll  = atan2(m[4], m[5])
 *
 * Sign convention after extraction:
 * - yaw   > 0 -> head turned to the user's right
 * - pitch < 0 -> head tilted/looking up   (negated so UP is negative)
 * - roll  > 0 -> head tilted toward the user's right shoulder
 *
 * NOTE: the pitch sign may flip depending on the exact matrix convention.
 * The spec allows inverting only the UP comparison in one place; do that here
 * (see invertPitchSign / POSITIVE_PITCH_IS_UP) after real-device calibration.
 */
export function matrixToHeadPose(matrix: number[]): HeadPose {
  const m = matrix;

  const yaw = toDegrees(Math.atan2(m[2], m[10]));
  const pitch = -toDegrees(Math.asin(clamp(m[6], -1, 1)));
  const roll = toDegrees(Math.atan2(m[4], m[5]));

  return { yaw, pitch, roll };
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Invert pitch so "look up" produces positive pitch (configurable in one place). */
export function invertPitchSign(pose: HeadPose): HeadPose {
  return { ...pose, pitch: -pose.pitch };
}

export const POSITIVE_PITCH_IS_UP = false;

/**
 * Mirrored-preview direction mapping. The preview is mirrored so it feels
 * natural; physical head turns map directly to the user's perception of left
 * and right. In a mirrored view, when the user turns their head to their own
 * left, the image yaw reads as right-positive — invert yaw for display
 * purposes only. UI display values are returned from here.
 */
export function mirroredYaw(yaw: number): number {
  return -yaw;
}
