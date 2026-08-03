/**
 * Single source of truth for scanner thresholds and behaviour.
 * Keep all tunable values here — do not scatter magic numbers through the UI.
 */

export const SCAN_CONFIG = {
  maxDurationMs: 25_000,
  countdownMs: 3_000,
  requiredHoldMs: 650,
  minimumStableFrames: 8,
  faceConfidenceMin: 0.9,
  centerYawAbsMax: 12,
  centerPitchAbsMax: 10,
  centerRollAbsMax: 12,
  leftYawMax: -20,
  rightYawMin: 20,
  upPitchThreshold: -15,
  faceAreaMinRatio: 0.12,
  faceAreaMaxRatio: 0.58,
  maxCenterOffsetRatio: 0.18,
  lostFaceGraceMs: 400,
} as const;

/** Controlled inference rate: ~15 FPS. */
export const TARGET_INFERENCE_INTERVAL_MS = 66;

/** Max recording duration and upload size (bytes). */
export const MAX_RECORDING_DURATION_MS = 25_000;
export const MAX_VIDEO_UPLOAD_BYTES = 30 * 1024 * 1024; // 30 MB

/** Best-frame capture settings. */
export const BEST_FRAME_JPEG_QUALITY = 0.9;
export const BEST_FRAME_MAX_DIMENSION = 1600;
export const BEST_FRAME_CROP_MARGIN_RATIO = 0.3;
export const THUMBNAIL_SIZE = 320;

/** MIME fallback order for MediaRecorder. */
export const MIME_CANDIDATES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/mp4;codecs=h264",
  "video/mp4",
  "video/webm",
] as const;

/** Normalized luminance bounds for lighting quality. */
export const LUMINANCE_MIN = 0.2;
export const LUMINANCE_MAX = 0.85;

/** Quality message keys surfaced to the user. */
export type QualityMessage =
  | "no_face"
  | "multiple_faces"
  | "move_closer"
  | "move_farther"
  | "center_face"
  | "improve_lighting"
  | "hold_steady"
  | "keep_face_visible"
  | "ok";

export const QUALITY_MESSAGE_TEXT: Record<QualityMessage, string> = {
  no_face: "No face detected",
  multiple_faces: "More than one face detected",
  move_closer: "Move closer",
  move_farther: "Move farther away",
  center_face: "Center your face",
  improve_lighting: "Improve the lighting",
  hold_steady: "Hold the phone steady",
  keep_face_visible: "Keep your full face visible",
  ok: "Face detected",
};

export type LivenessMode = "CUSTOM_CHALLENGE" | "AWS_FACE_LIVENESS";

export const CHALLENGE_SEQUENCE = ["CENTER", "LEFT", "RIGHT", "UP", "CENTER_FINAL"] as const;

export const STEP_INSTRUCTION_TEXT: Record<
  "CENTER" | "LEFT" | "RIGHT" | "UP" | "CENTER_FINAL",
  string
> = {
  CENTER: "Look straight at the camera",
  LEFT: "Turn your face slowly to the left",
  RIGHT: "Turn your face slowly to the right",
  UP: "Look upward slowly",
  CENTER_FINAL: "Return to the center",
};
