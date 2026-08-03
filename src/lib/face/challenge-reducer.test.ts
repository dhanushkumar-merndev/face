import { describe, expect, it } from "vitest";
import { reducer, initialState } from "@/lib/face/challenge-reducer";
import { SCAN_CONFIG } from "@/lib/face/config";
import type { FaceInfo, HeadPose } from "@/lib/face/types";

const face: FaceInfo = {
  confidence: 1,
  box: { x: 200, y: 150, width: 300, height: 400 },
  landmarks: [],
};

function framePayload(pose: HeadPose, elapsedMs: number, qualityOk = true, faceCount = 1) {
  return {
    type: "FRAME" as const,
    payload: {
      timestampMs: elapsedMs,
      elapsedMs,
      faceCount,
      face: faceCount === 1 ? face : undefined,
      pose,
      qualityMessage: qualityOk ? ("ok" as const) : ("hold_steady" as const),
      qualityOk,
      luminance: 0.5,
      sharpness: 0.5,
      frameWidth: 1000,
      frameHeight: 800,
    },
  };
}

const FRAME_MS = 100;

/**
 * Frames needed to satisfy a full hold, with margin. Derived from the config so
 * retuning requiredHoldMs does not silently invalidate these tests — the first
 * frame contributes no delta, hence the extra couple of frames.
 */
const HOLD_FRAMES = Math.ceil(SCAN_CONFIG.requiredHoldMs / FRAME_MS) + 2;

/** Frames of a failing pose needed to exceed the grace period. */
const GRACE_BREAK_FRAMES = Math.ceil(SCAN_CONFIG.lostFaceGraceMs / FRAME_MS) + 2;

/** Feeds `count` frames of `pose` at FRAME_MS intervals, starting after `fromMs`. */
function feed(
  state: ReturnType<typeof reducer>,
  pose: HeadPose,
  count: number,
  fromMs: number
): { state: ReturnType<typeof reducer>; t: number } {
  let t = fromMs;
  for (let i = 0; i < count; i += 1) {
    t += FRAME_MS;
    state = reducer(state, framePayload(pose, t));
  }
  return { state, t };
}

const CENTER_POSE: HeadPose = { yaw: 0, pitch: 0, roll: 0 };
const LEFT_POSE: HeadPose = { yaw: -25, pitch: 0, roll: 0 };
const RIGHT_POSE: HeadPose = { yaw: 25, pitch: 0, roll: 0 };
const BAD_POSE: HeadPose = { yaw: 40, pitch: 0, roll: 0 };

describe("challenge reducer — hold logic", () => {
  it("advances CENTER -> LEFT after a continuous hold", () => {
    let state = { ...initialState };
    state = reducer(state, { type: "COUNTDOWN_FINISHED" });
    expect(state.currentStep).toBe("CENTER");

    // Simulate frames at 100ms intervals meeting center condition.
    ({ state } = feed(state, CENTER_POSE, HOLD_FRAMES, 0));

    expect(state.currentStep).toBe("LEFT");
    expect(state.steps).toHaveLength(1);
    expect(state.steps[0].step).toBe("CENTER");
    expect(state.steps[0].passed).toBe(true);
    expect(state.steps[0].holdMs).toBeGreaterThanOrEqual(SCAN_CONFIG.requiredHoldMs);
  });

  it("resets hold when the pose fails for longer than the grace period", () => {
    let state = { ...initialState };
    state = reducer(state, { type: "COUNTDOWN_FINISHED" });

    // Partial hold — deliberately short of requiredHoldMs so the step cannot
    // complete before the pose is broken.
    const held = feed(state, CENTER_POSE, 3, 0);
    state = held.state;
    expect(state.stableDurationMs).toBeGreaterThan(0);

    // Break the pose for longer than the grace period.
    ({ state } = feed(state, BAD_POSE, GRACE_BREAK_FRAMES, held.t));

    expect(state.stableDurationMs).toBe(0);
    expect(state.stableFrames).toBe(0);
  });

  it("walks CENTER -> LEFT -> RIGHT and finishes", () => {
    let state = { ...initialState };
    state = reducer(state, { type: "COUNTDOWN_FINISHED" });
    const seen = new Set<string>();
    seen.add(state.currentStep as string);

    const seq = ["CENTER", "LEFT", "RIGHT"] as const;
    let t = 0;
    for (const expected of seq) {
      const pose =
        expected === "LEFT" ? LEFT_POSE : expected === "RIGHT" ? RIGHT_POSE : CENTER_POSE;
      ({ state, t } = feed(state, pose, HOLD_FRAMES, t));
      seen.add(state.currentStep as string);
    }

    expect(state.step).toBe("RECORDING_COMPLETE");
    expect(state.steps.map((s) => s.step)).toEqual(["CENTER", "LEFT", "RIGHT"]);
    expect(seen.has("LEFT")).toBe(true);
    expect(seen.has("RIGHT")).toBe(true);
    // The removed directions must not appear anywhere.
    expect(seen.has("UP")).toBe(false);
    expect(seen.has("CENTER_FINAL")).toBe(false);
    expect(seen.has("DOWN")).toBe(false);
  });

  it("arms on the first matching frame and disarms for the next direction", () => {
    let state = { ...initialState };
    state = reducer(state, { type: "COUNTDOWN_FINISHED" });
    expect(state.armed).toBe(false);

    // One good CENTER frame is enough to start that direction's recording.
    state = reducer(state, framePayload(CENTER_POSE, 100));
    expect(state.armed).toBe(true);

    // Arming is sticky across a brief wobble so the clip is not chopped up.
    state = reducer(state, framePayload(BAD_POSE, 200));
    expect(state.armed).toBe(true);

    // Completing CENTER hands over to LEFT, which starts disarmed.
    ({ state } = feed(state, CENTER_POSE, HOLD_FRAMES, 200));
    expect(state.currentStep).toBe("LEFT");
    expect(state.armed).toBe(false);
  });

  it("handles cancel", () => {
    const state = reducer(initialState, { type: "CANCEL" });
    expect(state.step).toBe("CANCELLED");
  });

  it("handles timeout", () => {
    const state = reducer(initialState, { type: "TIMEOUT" });
    expect(state.step).toBe("FAILED");
    expect(state.failureCode).toBe("scan_timeout");
  });
});
