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

describe("challenge reducer — hold logic", () => {
  it("advances CENTER -> LEFT after a continuous hold", () => {
    let state = { ...initialState };
    state = reducer(state, { type: "COUNTDOWN_FINISHED" });
    expect(state.currentStep).toBe("CENTER");

    // Simulate frames at 100ms intervals meeting center condition.
    for (let t = 100; t <= 1000; t += 100) {
      state = reducer(state, framePayload({ yaw: 0, pitch: 0, roll: 0 }, t, true));
    }

    expect(state.currentStep).toBe("LEFT");
    expect(state.steps).toHaveLength(1);
    expect(state.steps[0].step).toBe("CENTER");
    expect(state.steps[0].passed).toBe(true);
    expect(state.steps[0].holdMs).toBeGreaterThanOrEqual(SCAN_CONFIG.requiredHoldMs);
  });

  it("resets hold when the pose fails for longer than the grace period", () => {
    let state = { ...initialState };
    state = reducer(state, { type: "COUNTDOWN_FINISHED" });

    // Hold for 400ms.
    for (let t = 100; t <= 400; t += 100) {
      state = reducer(state, framePayload({ yaw: 0, pitch: 0, roll: 0 }, t));
    }
    expect(state.stableDurationMs).toBeGreaterThan(0);

    // Bad pose for 600ms > grace 400ms (frames at 500..1000).
    for (let t = 500; t <= 1000; t += 100) {
      state = reducer(state, framePayload({ yaw: 40, pitch: 0, roll: 0 }, t));
    }

    expect(state.stableDurationMs).toBe(0);
    expect(state.stableFrames).toBe(0);
  });

  it("walks CENTER -> LEFT -> RIGHT and finishes", () => {
    let state = { ...initialState };
    state = reducer(state, { type: "COUNTDOWN_FINISHED" });
    const seen = new Set<string>();
    seen.add(state.currentStep as string);

    const seq = ["CENTER", "LEFT", "RIGHT"];
    let t = 0;
    for (const expected of seq) {
      const pose: HeadPose =
        expected === "LEFT"
          ? { yaw: -25, pitch: 0, roll: 0 }
          : expected === "RIGHT"
            ? { yaw: 25, pitch: 0, roll: 0 }
            : { yaw: 0, pitch: 0, roll: 0 };
      // Give each step 10 frames of 100ms.
      for (let i = 0; i < 10; i++) {
        t += 100;
        state = reducer(state, framePayload(pose, t));
      }
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
    state = reducer(state, framePayload({ yaw: 0, pitch: 0, roll: 0 }, 100));
    expect(state.armed).toBe(true);

    // Arming is sticky across a brief wobble so the clip is not chopped up.
    state = reducer(state, framePayload({ yaw: 40, pitch: 0, roll: 0 }, 200));
    expect(state.armed).toBe(true);

    // Completing CENTER hands over to LEFT, which starts disarmed.
    for (let t = 300; t <= 1400; t += 100) {
      state = reducer(state, framePayload({ yaw: 0, pitch: 0, roll: 0 }, t));
    }
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
