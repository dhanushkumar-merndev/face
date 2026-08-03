import { SCAN_CONFIG, LUMINANCE_MIN, LUMINANCE_MAX } from "./config";
import type { QualityResult, QualityMessage, FaceInfo, HeadPose } from "./types";

/**
 * Client-side quality checks. All functions are pure and testable.
 * Canvas-backed blur/lighting helpers live in canvas-quality.ts.
 */

export function faceAreaRatio(box: FaceBoxLike, frameArea: number): number {
  if (frameArea <= 0) return 0;
  return (box.width * box.height) / frameArea;
}

export interface FaceBoxLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function isFaceAreaValid(box: FaceBoxLike, frameArea: number): boolean {
  const ratio = faceAreaRatio(box, frameArea);
  return ratio >= SCAN_CONFIG.faceAreaMinRatio && ratio <= SCAN_CONFIG.faceAreaMaxRatio;
}

export function isFaceCentered(box: FaceBoxLike, frameWidth: number, frameHeight: number): boolean {
  const faceCenterX = box.x + box.width / 2;
  const faceCenterY = box.y + box.height / 2;
  const offsetX = Math.abs(faceCenterX - frameWidth / 2) / frameWidth;
  const offsetY = Math.abs(faceCenterY - frameHeight / 2) / frameHeight;
  return offsetX <= SCAN_CONFIG.maxCenterOffsetRatio && offsetY <= SCAN_CONFIG.maxCenterOffsetRatio;
}

export interface QualityInput {
  faceCount: number;
  face?: FaceInfo;
  frameWidth: number;
  frameHeight: number;
  luminance?: number;
  sharpness?: number;
}

/** Combine structural checks (count, size, centering) with exposure/Blur. */
export function evaluateQuality(input: QualityInput): QualityResult {
  const { faceCount, face, frameWidth, frameHeight, luminance, sharpness } = input;

  if (faceCount === 0) {
    return { ok: false, message: "no_face" as QualityMessage };
  }
  if (faceCount > 1) {
    return { ok: false, message: "multiple_faces" as QualityMessage };
  }
  if (!face) {
    return { ok: false, message: "no_face" as QualityMessage };
  }

  if (face.confidence < SCAN_CONFIG.faceConfidenceMin) {
    return { ok: false, message: "keep_face_visible" as QualityMessage };
  }

  const area = frameWidth * frameHeight;
  const ratio = faceAreaRatio(face.box, area);
  if (ratio < SCAN_CONFIG.faceAreaMinRatio) {
    return { ok: false, message: "move_closer" as QualityMessage };
  }
  if (ratio > SCAN_CONFIG.faceAreaMaxRatio) {
    return { ok: false, message: "move_farther" as QualityMessage };
  }

  if (!isFaceCentered(face.box, frameWidth, frameHeight)) {
    return { ok: false, message: "center_face" as QualityMessage };
  }

  if (luminance !== undefined && (luminance < LUMINANCE_MIN || luminance > LUMINANCE_MAX)) {
    return { ok: false, message: "improve_lighting" as QualityMessage };
  }

  if (sharpness !== undefined && sharpness < 0.02) {
    return { ok: false, message: "hold_steady" as QualityMessage };
  }

  return { ok: true, message: "ok" as QualityMessage };
}

// ---------------------------------------------------------------------------
// Step predicates
// ---------------------------------------------------------------------------

export interface StepConditionInput {
  pose: HeadPose;
  face?: FaceInfo;
  frameWidth: number;
  frameHeight: number;
  faceCount: number;
  qualityOk: boolean;
}

function within(value: number, absMax: number): boolean {
  return Math.abs(value) <= absMax;
}

export function centerCondition(input: StepConditionInput): boolean {
  const { pose } = input;
  return (
    input.qualityOk &&
    within(pose.yaw, SCAN_CONFIG.centerYawAbsMax) &&
    within(pose.pitch, SCAN_CONFIG.centerPitchAbsMax) &&
    within(pose.roll, SCAN_CONFIG.centerRollAbsMax)
  );
}

export function leftCondition(input: StepConditionInput): boolean {
  const { pose } = input;
  // Physical left turn; yaw convention corrected once in the pose adapter.
  return (
    input.qualityOk &&
    pose.yaw <= SCAN_CONFIG.leftYawMax &&
    within(pose.pitch, 15) &&
    within(pose.roll, 15)
  );
}

export function rightCondition(input: StepConditionInput): boolean {
  const { pose } = input;
  return (
    input.qualityOk &&
    pose.yaw >= SCAN_CONFIG.rightYawMin &&
    within(pose.pitch, 15) &&
    within(pose.roll, 15)
  );
}

export const STEP_CONDITIONS: Record<
  "CENTER" | "LEFT" | "RIGHT",
  (input: StepConditionInput) => boolean
> = {
  CENTER: centerCondition,
  LEFT: leftCondition,
  RIGHT: rightCondition,
};
