import { SCAN_CONFIG, CHALLENGE_SEQUENCE, type QualityMessage } from "./config";
import type {
  ScanStep,
  ChallengeStep,
  HeadPose,
  FaceInfo,
  StepResult,
} from "./types";
import { STEP_CONDITIONS } from "./quality";
import { computeFrameScore } from "./frame-score";

/**
 * The scanner state machine. Pure reducer — testable without the DOM.
 *
 * Flow:
 *   PREPARING -> CENTER -> LEFT -> RIGHT -> UP -> CENTER_FINAL
 *   -> RECORDING_COMPLETE -> UPLOADING -> ANALYZING -> COMPLETED
 * With FAILED / CANCELLED as terminal states. There is intentionally no
 * DOWN step anywhere in this machine.
 */

export type ChallengeAction =
  | { type: "START" }
  | { type: "COUNTDOWN_FINISHED" }
  | { type: "RECORDING_STARTED" }
  | { type: "FRAME"; payload: FramePayload }
  | { type: "TIMEOUT" }
  | { type: "CANCEL" }
  | { type: "UPLOAD_START" }
  | { type: "ANALYZE_START" }
  | { type: "COMPLETE" }
  | { type: "FAIL"; payload: { code: string; message: string } }
  | { type: "CANCELLED_ACK" };

export interface FramePayload {
  /** Milliseconds since recording start (or scan start during prep). */
  timestampMs: number;
  elapsedMs: number;
  faceCount: number;
  face?: FaceInfo;
  pose: HeadPose;
  qualityMessage: QualityMessage;
  qualityOk: boolean;
  luminance?: number;
  sharpness?: number;
  frameWidth?: number;
  frameHeight?: number;
}

export interface BestFrameCandidate {
  score: number;
  timestampMs: number;
}

export interface ChallengeState {
  step: ScanStep;
  /** Active challenge step (undefined before countdown). */
  currentStep: ChallengeStep | null;
  stepIndex: number;
  stableDurationMs: number;
  stableFrames: number;
  /** Hold progress in ms, exposed for UI progress rings. */
  holdProgressMs: number;
  startTimeMs: number | null;
  recordedAtMs: number | null;
  lastFrameAtMs: number | null;
  failedTimeMs: number | null;
  lastPose: HeadPose;
  steps: StepResult[];
  bestFrame: BestFrameCandidate | null;
  failureCode: string | null;
  failureMessage: string | null;
  cancelled: boolean;
  /** Aggregate quality stats across the scan. */
  qualitySummary: {
    minimumFaceCount: number;
    maximumFaceCount: number;
    averageBrightness: number;
    bestSharpness: number;
    frames: number;
  };
}

const initialState: ChallengeState = {
  step: "PREPARING",
  currentStep: null,
  stepIndex: 0,
  stableDurationMs: 0,
  stableFrames: 0,
  holdProgressMs: 0,
  startTimeMs: null,
  recordedAtMs: null,
  lastFrameAtMs: null,
  failedTimeMs: null,
  lastPose: { yaw: 0, pitch: 0, roll: 0 },
  steps: [],
  bestFrame: null,
  failureCode: null,
  failureMessage: null,
  cancelled: false,
  qualitySummary: {
    minimumFaceCount: 99,
    maximumFaceCount: 0,
    averageBrightness: 0,
    bestSharpness: 0,
    frames: 0,
  },
};

function nextChallengeStep(index: number): ChallengeStep | null {
  return index < CHALLENGE_SEQUENCE.length
    ? (CHALLENGE_SEQUENCE[index] as ChallengeStep)
    : null;
}

function startStep(state: ChallengeState, index: number): ChallengeState {
  const step = nextChallengeStep(index);
  return {
    ...state,
    step: step ?? state.step,
    stepIndex: index,
    currentStep: step,
    stableDurationMs: 0,
    stableFrames: 0,
    holdProgressMs: 0,
    failedTimeMs: null,
  };
}

function finishStep(state: ChallengeState): ChallengeState {
  const step = state.currentStep;
  if (!step) return state;

  const nextIndex = state.stepIndex + 1;

  const result: StepResult = {
    step,
    stepOrder: state.stepIndex + 1,
    passed: true,
    holdMs: Math.round(state.stableDurationMs),
    representativeYaw: state.lastPose.yaw,
    representativePitch: state.lastPose.pitch,
    representativeRoll: state.lastPose.roll,
    frameTimestampMs: state.lastFrameAtMs ?? 0,
  };

  const newSteps = [...state.steps, result];

  if (step === "CENTER_FINAL") {
    return {
      ...state,
      steps: newSteps,
      step: "RECORDING_COMPLETE",
      currentStep: null,
      recordedAtMs: state.lastFrameAtMs,
    };
  }

  const nextState: ChallengeState = { ...state, steps: newSteps };
  return startStep(nextState, nextIndex);
}

export function reducer(state: ChallengeState, action: ChallengeAction): ChallengeState {
  switch (action.type) {
    case "START":
      return {
        ...state,
        step: "PREPARING",
        startTimeMs: Date.now(),
      };

    case "COUNTDOWN_FINISHED":
      return startStep(state, 0);

    case "RECORDING_STARTED":
      return {
        ...state,
        recordedAtMs: Date.now(),
      };

    case "FRAME": {
      const payload = action.payload;

      if (
        state.step === "CENTER" ||
        state.step === "LEFT" ||
        state.step === "RIGHT" ||
        state.step === "UP" ||
        state.step === "CENTER_FINAL"
      ) {
        return applyFrame(state, payload);
      }
      return state;
    }

    case "TIMEOUT":
      return {
        ...state,
        step: "FAILED",
        failureCode: "scan_timeout",
        failureMessage: "The scan took too long. Please try again.",
      };

    case "CANCEL":
      return {
        ...state,
        step: "CANCELLED",
        cancelled: true,
      };

    case "UPLOAD_START":
      return { ...state, step: "UPLOADING" };

    case "ANALYZE_START":
      return { ...state, step: "ANALYZING" };

    case "COMPLETE":
      return { ...state, step: "COMPLETED" };

    case "FAIL":
      return {
        ...state,
        step: "FAILED",
        failureCode: action.payload.code,
        failureMessage: action.payload.message,
      };

    case "CANCELLED_ACK":
      return state;
  }
}

function applyFrame(state: ChallengeState, payload: FramePayload): ChallengeState {
  const currentStep = state.currentStep;
  if (!currentStep) return state;

  const { faceCount, face, pose, frameWidth = 0, frameHeight = 0 } = payload;

  const condition = STEP_CONDITIONS[currentStep];
  const passes = condition({
    pose,
    face,
    frameWidth,
    frameHeight,
    faceCount,
    qualityOk: payload.qualityOk,
  });

  const now = payload.elapsedMs;
  const delta = state.lastFrameAtMs === null ? 0 : now - state.lastFrameAtMs;
  const graceMs = SCAN_CONFIG.lostFaceGraceMs;

  let stableDurationMs = state.stableDurationMs;
  let stableFrames = state.stableFrames;
  let failedTimeMs = state.failedTimeMs;

  if (passes) {
    stableDurationMs += delta;
    stableFrames += 1;
    failedTimeMs = null;
  } else {
    if (failedTimeMs === null) {
      failedTimeMs = now;
    }
    const failDuration = now - failedTimeMs;
    if (failDuration > graceMs) {
      stableDurationMs = 0;
      stableFrames = 0;
    }
  }

  // Best-frame scoring during CENTER_FINAL (actual capture happens in the
  // component from original video resolution).
  let bestFrame = state.bestFrame;
  if (currentStep === "CENTER_FINAL" && face && payload.frameWidth && payload.frameHeight) {
    const score = computeFrameScore({
      pose,
      face,
      frameWidth: payload.frameWidth,
      frameHeight: payload.frameHeight,
      quality: { ok: payload.qualityOk, message: payload.qualityMessage },
      sharpness: payload.sharpness ?? 0,
      luminance: payload.luminance ?? 0.5,
    });
    if (score > (bestFrame?.score ?? 0)) {
      bestFrame = { score, timestampMs: now };
    }
  }

  const qualitySummary = aggregateQuality(state, payload);

  const holdProgressMs = stableDurationMs;
  const holdComplete = stableDurationMs >= SCAN_CONFIG.requiredHoldMs &&
    stableFrames >= SCAN_CONFIG.minimumStableFrames;

  if (holdComplete) {
    return finishStep({
      ...state,
      ...qualitySummary,
      stableDurationMs,
      stableFrames,
      lastFrameAtMs: now,
      lastPose: pose,
      bestFrame,
      holdProgressMs,
    });
  }

  return {
    ...state,
    ...qualitySummary,
    stableDurationMs,
    stableFrames,
    failedTimeMs,
    lastFrameAtMs: now,
    lastPose: pose,
    holdProgressMs,
    bestFrame,
  };
}

function aggregateQuality(state: ChallengeState, payload: FramePayload): Partial<ChallengeState> {
  const frames = state.qualitySummary.frames + 1;
  const averageBrightness =
    (state.qualitySummary.averageBrightness * state.qualitySummary.frames +
      (payload.luminance ?? 0.5)) /
    frames;
  return {
    qualitySummary: {
      minimumFaceCount: Math.min(state.qualitySummary.minimumFaceCount, payload.faceCount),
      maximumFaceCount: Math.max(state.qualitySummary.maximumFaceCount, payload.faceCount),
      averageBrightness,
      bestSharpness: Math.max(state.qualitySummary.bestSharpness, payload.sharpness ?? 0),
      frames,
    },
  };
}

export { initialState };
