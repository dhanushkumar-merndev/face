import { describe, expect, it, vi } from "vitest";
import { createStandardSkinReadout } from "./skin-analysis";

describe("createStandardSkinReadout", () => {
  it("returns a display-ready result from the approved age set", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.51);

    const result = createStandardSkinReadout();

    expect([24, 30, 40, 48]).toContain(result.skinAge);
    expect(result.provider).toBe("standard");
    expect(result.summary).not.toHaveLength(0);
    expect(Object.values(result.scores)).toHaveLength(5);
    expect(result.tips.length).toBeGreaterThan(0);
  });
});
