import type { CoverTransform, MeshPoint } from "./mesh";

/**
 * Fallback guide in normalized video-frame coordinates, used only until the
 * overlay has measured the drawn oval and reported it back.
 *
 * The rule and the drawing used to disagree: the gate compared the face centre
 * against a ±35%-of-frame box while the oval was sized from the viewport, so a
 * face pressed against the edge of the frame — plainly outside the oval — still
 * passed and recorded. The oval now defines both.
 */
export const FACE_GUIDE = {
  centerX: 0.5,
  /** Slightly above centre, matching how people frame themselves on a selfie camera. */
  centerY: 0.46,
  radiusX: 0.26,
  radiusY: 0.36,
} as const;

/** Share of the face's landmarks that must fall inside the guide to record. */
export const MIN_INSIDE_GUIDE_RATIO = 0.7;

export interface GuideEllipse {
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
}

/** True when a normalized landmark sits inside the guide ellipse. */
export function isInsideGuide(point: MeshPoint, guide: GuideEllipse = FACE_GUIDE): boolean {
  const dx = (point.x - guide.centerX) / guide.radiusX;
  const dy = (point.y - guide.centerY) / guide.radiusY;
  return dx * dx + dy * dy <= 1;
}

/**
 * Share of landmarks inside the guide, 0-1. Counting landmarks rather than
 * bounding-box overlap means hair and ears, which sit outside the oval on
 * almost everyone, cost proportionally rather than failing the whole face.
 */
export function insideGuideRatio(
  landmarks: MeshPoint[],
  guide: GuideEllipse = FACE_GUIDE
): number {
  if (landmarks.length === 0) return 0;
  let inside = 0;
  for (const point of landmarks) {
    if (isInsideGuide(point, guide)) inside += 1;
  }
  return inside / landmarks.length;
}

export interface CanvasEllipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/**
 * The drawn guide, sized from the viewport. This is the original appearance and
 * stays the single definition of how the oval *looks*; the rule follows it via
 * `unprojectGuide` rather than the other way round.
 */
export function canvasGuideGeometry(width: number, height: number): CanvasEllipse {
  const baseRx = Math.min(width, height) * 0.28;
  const rx = Math.max(120, Math.min(baseRx, 180));
  return {
    cx: width / 2,
    // Slightly above centre, matching how people hold a selfie camera.
    cy: height * 0.44,
    rx,
    ry: rx * 1.34,
  };
}

/**
 * Converts the drawn oval back into normalized video coordinates, the space
 * landmarks live in, so containment is tested against the very ellipse on
 * screen. Mirroring is undone here because the preview is flipped.
 */
export function unprojectGuide(
  ellipse: CanvasEllipse,
  transform: CoverTransform
): GuideEllipse {
  if (transform.displayWidth <= 0 || transform.displayHeight <= 0) return FACE_GUIDE;
  return {
    centerX: 1 - (ellipse.cx - transform.offsetX) / transform.displayWidth,
    centerY: (ellipse.cy - transform.offsetY) / transform.displayHeight,
    radiusX: ellipse.rx / transform.displayWidth,
    radiusY: ellipse.ry / transform.displayHeight,
  };
}
