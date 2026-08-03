export type ScanStep =
  | "PREPARING"
  | "CENTER"
  | "LEFT"
  | "RIGHT"
  | "UP"
  | "CENTER_FINAL"
  | "RECORDING_COMPLETE"
  | "UPLOADING"
  | "ANALYZING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type ChallengeStep = "CENTER" | "LEFT" | "RIGHT" | "UP" | "CENTER_FINAL";

export interface HeadPose {
  yaw: number;
  pitch: number;
  roll: number;
}

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FaceInfo {
  confidence: number;
  box: FaceBox;
  landmarks: Array<{ x: number; y: number }>;
  leftEye?: { x: number; y: number };
  rightEye?: { x: number; y: number };
  occlusion?: { leftEye: number; rightEye: number; mouth: number };
}

export interface QualityResult {
  ok: boolean;
  message: QualityMessage;
  luminance?: number;
  sharpness?: number;
}

export type QualityMessage = import("./config").QualityMessage;

export interface FrameMetrics {
  pose: HeadPose;
  face: FaceInfo;
  quality: QualityResult;
}

export interface StepResult {
  step: ChallengeStep;
  stepOrder: number;
  passed: boolean;
  holdMs: number;
  representativeYaw: number;
  representativePitch: number;
  representativeRoll: number;
  frameTimestampMs: number;
}
