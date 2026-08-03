/**
 * Single source of truth for scanner thresholds and behaviour.
 * Keep all tunable values here — do not scatter magic numbers through the UI.
 */

export const SCAN_CONFIG = {
  maxDurationMs: 90_000,
  countdownMs: 3_000,
  /**
   * How long each direction must be held. The segment recorder starts on pose
   * lock and stops when the hold completes, so this is also the length of each
   * captured clip — roughly 3s per side.
   */
  requiredHoldMs: 3_000,
  minimumStableFrames: 6,
  faceConfidenceMin: 0.5,
  centerYawAbsMax: 14,
  centerPitchAbsMax: 14,
  centerRollAbsMax: 14,
  leftYawMax: -14,
  rightYawMin: 14,
  faceAreaMinRatio: 0.04,
  faceAreaMaxRatio: 0.70,
  maxCenterOffsetRatio: 0.35,
  /**
   * Losing the pose for longer than this zeroes the hold progress outright.
   * Scaled up with requiredHoldMs: at a 3s hold, a 400ms window meant one
   * wobble near the end threw away the whole segment and the user started the
   * direction over.
   */
  lostFaceGraceMs: 800,
  /** Pause after a direction is captured, before the next one is shown. */
  stepTransitionMs: 800,
} as const;

/** Controlled inference rate: ~15 FPS. */
export const TARGET_INFERENCE_INTERVAL_MS = 66;

/**
 * Max duration of the whole scan and per-segment upload size (bytes).
 * Must stay in step with SCAN_CONFIG.maxDurationMs — three 3s holds plus the
 * time spent finding each pose no longer fits comfortably in 60s.
 */
export const MAX_RECORDING_DURATION_MS = 90_000;
export const MAX_VIDEO_UPLOAD_BYTES = 30 * 1024 * 1024; // 30 MB per segment

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
  | "obstruction_detected"
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
  obstruction_detected: "Remove glasses or obstructions",
  ok: "Face detected",
};

export type LivenessMode = "CUSTOM_CHALLENGE" | "AWS_FACE_LIVENESS";

/**
 * The guided capture sequence. Each direction records its own short video
 * segment and its own still frame: the segment starts when the user reaches
 * the pose and stops when the hold completes, then the next direction is shown.
 */
export const CHALLENGE_SEQUENCE = ["CENTER", "LEFT", "RIGHT"] as const;

export const CHALLENGE_VERSION = "center-left-right-v2";

export const STEP_INSTRUCTION_TEXT: Record<"CENTER" | "LEFT" | "RIGHT", string> = {
  CENTER: "Look straight at the camera",
  LEFT: "Slowly turn your face to the left",
  RIGHT: "Slowly turn your face to the right",
};

/** Short label used in compact HUD chips. */
export const STEP_SHORT_LABEL: Record<"CENTER" | "LEFT" | "RIGHT", string> = {
  CENTER: "Center",
  LEFT: "Left",
  RIGHT: "Right",
};

/** Helper copy shown under the instruction while a direction is pending. */
export const STEP_HINT_TEXT: Record<"CENTER" | "LEFT" | "RIGHT", string> = {
  CENTER: "Keep your head upright and fill the outline",
  LEFT: "Turn until your right cheek faces the camera",
  RIGHT: "Turn until your left cheek faces the camera",
};
