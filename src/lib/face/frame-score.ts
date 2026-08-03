import { SCAN_CONFIG } from "./config";
import type { HeadPose, FaceInfo, QualityResult } from "./types";

/**
 * Scores a candidate frontal frame for best-frame selection.
 * Higher is better. Pure and unit-testable.
 */

export interface FrameScoreInput {
  pose: HeadPose;
  face: FaceInfo;
  frameWidth: number;
  frameHeight: number;
  quality: QualityResult;
  sharpness: number;
  luminance: number;
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Frontal pose score: 1 when facing camera, decays with yaw/pitch/roll. */
export function frontalScore(pose: HeadPose): number {
  const yawPenalty = Math.abs(pose.yaw) / 30;
  const pitchPenalty = Math.abs(pose.pitch) / 30;
  const rollPenalty = Math.abs(pose.roll) / 30;
  return clamp01(1 - (yawPenalty + pitchPenalty + rollPenalty) / 3);
}

/** Face-centered score: 1 when the face is centered in the frame. */
export function centeredScore(face: FaceInfo, frameWidth: number, frameHeight: number): number {
  const cx = face.box.x + face.box.width / 2;
  const cy = face.box.y + face.box.height / 2;
  const dx = Math.abs(cx - frameWidth / 2) / (frameWidth / 2);
  const dy = Math.abs(cy - frameHeight / 2) / (frameHeight / 2);
  return clamp01(1 - (dx + dy) / 2);
}

/** Face-size score: 1 inside the preferred band, falling off outside it. */
export function faceSizeScore(face: FaceInfo, frameArea: number): number {
  const ratio = (face.box.width * face.box.height) / frameArea;
  const min = SCAN_CONFIG.faceAreaMinRatio;
  const max = SCAN_CONFIG.faceAreaMaxRatio;
  const preferred = (min + max) / 2;
  const range = (max - min) / 2;

  const distance = Math.abs(ratio - preferred) / range;
  return clamp01(1 - distance);
}

/** Occlusion penalty: how much of the face is occluded (1 = fully). */
export function occlusionPenalty(face: FaceInfo): number {
  if (!face.occlusion) return 0;
  const { leftEye, rightEye, mouth } = face.occlusion;
  return clamp01((leftEye + rightEye + mouth) / 3);
}

export function computeFrameScore(input: FrameScoreInput): number {
  const frontal = frontalScore(input.pose);
  const sharpness = clamp01(input.sharpness);
  const exposure = clamp01(1 - Math.abs(input.luminance - 0.5) * 2);
  const centered = centeredScore(input.face, input.frameWidth, input.frameHeight);
  const size = faceSizeScore(input.face, input.frameWidth * input.frameHeight);
  const occlusion = occlusionPenalty(input.face);

  let score =
    frontal * 0.35 +
    sharpness * 0.25 +
    exposure * 0.15 +
    centered * 0.15 +
    size * 0.1;

  score -= occlusion * 0.2;

  // Frames that fail hard quality (e.g. multiple faces) are ineligible.
  if (!input.quality.ok) {
    score = 0;
  }

  return clamp01(score);
}
