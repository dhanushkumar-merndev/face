import { describe, it, expect } from "vitest";
import {
  scoreEyewear,
  EYEWEAR_EDGE_RATIO_MIN,
  EYEWEAR_LUMINANCE_DEVIATION_MIN,
} from "./eyewear";

describe("scoreEyewear", () => {
  it("flags dark-rimmed frames, where the eye band is busier and darker", () => {
    const verdict = scoreEyewear({
      eye: { luminance: 0.34, edgeEnergy: 0.09 },
      cheek: { luminance: 0.46, edgeEnergy: 0.03 },
    });

    expect(verdict.edgeRatio).toBeCloseTo(3, 5);
    expect(verdict.likely).toBe(true);
  });

  it("flags reflecting lenses, where the eye band is busier and brighter", () => {
    // The case that was being missed: coated lenses catching a window make the
    // eye band lighter than the cheek, not darker.
    const verdict = scoreEyewear({
      eye: { luminance: 0.62, edgeEnergy: 0.08 },
      cheek: { luminance: 0.46, edgeEnergy: 0.03 },
    });

    expect(verdict.luminanceDeviation).toBeGreaterThan(EYEWEAR_LUMINANCE_DEVIATION_MIN);
    expect(verdict.likely).toBe(true);
  });

  it("does not flag a bare face, where brows raise edges but tone matches", () => {
    const verdict = scoreEyewear({
      eye: { luminance: 0.452, edgeEnergy: 0.075 },
      cheek: { luminance: 0.46, edgeEnergy: 0.03 },
    });

    expect(verdict.edgeRatio).toBeGreaterThan(EYEWEAR_EDGE_RATIO_MIN);
    expect(verdict.luminanceDeviation).toBeLessThan(EYEWEAR_LUMINANCE_DEVIATION_MIN);
    expect(verdict.likely).toBe(false);
  });

  it("does not flag shadow alone, where the band is darker but not busier", () => {
    const verdict = scoreEyewear({
      eye: { luminance: 0.3, edgeEnergy: 0.04 },
      cheek: { luminance: 0.46, edgeEnergy: 0.03 },
    });

    expect(verdict.luminanceDeviation).toBeGreaterThan(EYEWEAR_LUMINANCE_DEVIATION_MIN);
    expect(verdict.edgeRatio).toBeLessThan(EYEWEAR_EDGE_RATIO_MIN);
    expect(verdict.likely).toBe(false);
  });

  it("survives an all-black reference band without dividing by zero", () => {
    const verdict = scoreEyewear({
      eye: { luminance: 0, edgeEnergy: 0.05 },
      cheek: { luminance: 0, edgeEnergy: 0 },
    });

    expect(Number.isFinite(verdict.edgeRatio)).toBe(true);
    expect(Number.isFinite(verdict.luminanceDeviation)).toBe(true);
  });
});
