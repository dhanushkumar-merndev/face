import { describe, it, expect } from "vitest";
import {
  FACE_GUIDE,
  canvasGuideGeometry,
  insideGuideRatio,
  isInsideGuide,
  unprojectGuide,
} from "./guide";
import { computeCoverTransform, projectLandmark } from "./mesh";

describe("isInsideGuide", () => {
  it("accepts the guide centre and rejects the frame edge", () => {
    expect(isInsideGuide({ x: FACE_GUIDE.centerX, y: FACE_GUIDE.centerY })).toBe(true);
    expect(isInsideGuide({ x: 0.02, y: 0.5 })).toBe(false);
  });

  it("treats the ellipse boundary as inside", () => {
    expect(isInsideGuide({ x: FACE_GUIDE.centerX + FACE_GUIDE.radiusX, y: FACE_GUIDE.centerY })).toBe(
      true
    );
  });
});

describe("insideGuideRatio", () => {
  it("is 0 for an empty landmark list rather than NaN", () => {
    expect(insideGuideRatio([])).toBe(0);
  });

  it("scores a centred face at 1 and an off-frame face at 0", () => {
    const centred = [
      { x: 0.5, y: 0.46 },
      { x: 0.55, y: 0.5 },
      { x: 0.45, y: 0.42 },
    ];
    const offLeft = [
      { x: 0.05, y: 0.5 },
      { x: 0.08, y: 0.55 },
    ];

    expect(insideGuideRatio(centred)).toBe(1);
    expect(insideGuideRatio(offLeft)).toBe(0);
  });

  it("scores partial containment proportionally", () => {
    const half = [
      { x: 0.5, y: 0.46 },
      { x: 0.5, y: 0.47 },
      { x: 0.02, y: 0.9 },
      { x: 0.98, y: 0.05 },
    ];
    expect(insideGuideRatio(half)).toBe(0.5);
  });
});

describe("unprojectGuide", () => {
  it("maps the drawn oval into the space landmarks live in", () => {
    const width = 800;
    const height = 600;
    const transform = computeCoverTransform(1280, 720, width, height);
    const drawn = canvasGuideGeometry(width, height);
    const guide = unprojectGuide(drawn, transform);

    // Horizontally centred, so un-mirroring leaves the centre in place.
    expect(guide.centerX).toBeCloseTo(0.5, 5);
    expect(guide.radiusX).toBeCloseTo(drawn.rx / transform.displayWidth, 5);
    expect(guide.radiusY).toBeCloseTo(drawn.ry / transform.displayHeight, 5);
  });

  it("agrees with where a landmark at the guide centre is drawn", () => {
    const width = 900;
    const height = 700;
    const transform = computeCoverTransform(1280, 720, width, height);
    const guide = unprojectGuide(canvasGuideGeometry(width, height), transform);

    // Projecting the derived centre must land back on the drawn centre.
    const projected = projectLandmark({ x: guide.centerX, y: guide.centerY }, transform);
    expect(projected.x).toBeCloseTo(width / 2, 5);
    expect(projected.y).toBeCloseTo(height * 0.44, 5);
  });

  it("falls back to the default guide when the video has no size yet", () => {
    const transform = computeCoverTransform(0, 0, 0, 0);
    expect(unprojectGuide({ cx: 1, cy: 1, rx: 1, ry: 1 }, transform)).toEqual(FACE_GUIDE);
  });
});
