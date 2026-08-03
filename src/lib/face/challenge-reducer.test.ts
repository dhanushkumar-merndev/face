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

  it("never contains a DOWN step anywhere", () => {
    let state = { ...initialState };
    state = reducer(state, { type: "COUNTDOWN_FINISHED" });
    const seen = new Set<string>();
    seen.add(state.currentStep as string);

    // Walk through the whole sequence with perfect poses.
    const seq = ["CENTER", "LEFT", "RIGHT", "UP", "CENTER_FINAL"];
    let t = 0;
    for (const expected of seq) {
      // Step should start.
      if (state.currentStep !== expected) {
        // Might already have advanced; drive it with a matching pose.
      }
      // Give each step 10 frames of 100ms.
      const pose: HeadPose =
        expected === "LEFT"
          ? { yaw: -25, pitch: 0, roll: 0 }
          : expected === "RIGHT"
            ? { yaw: 25, pitch: 0, roll: 0 }
            : expected === "UP"
              ? { yaw: 0, pitch: -20, roll: 0 }
              : { yaw: 0, pitch: 0, roll: 0 };
      for (let i = 0; i < 10; i++) {
        t += 100;
        state = reducer(state, framePayload(pose, t));
      }
      seen.add(state.currentStep as string);
    }

    expect(state.step).toBe("RECORDING_COMPLETE");
    expect(seen.has("DOWN")).toBe(false);
    expect(seen.has("LEFT")).toBe(true);
    expect(seen.has("RIGHT")).toBe(true);
    expect(seen.has("UP")).toBe(true);
    expect(seen.has("CENTER_FINAL")).toBe(true);
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
