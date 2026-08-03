/**
 * Pure geometry helpers for rendering the live face structure on a canvas
 * that sits on top of an `object-fit: cover` mirrored video preview.
 *
 * Kept free of DOM/canvas APIs so the mapping maths stays testable.
 */

export type MeshConnection = { start: number; end: number };

export interface MeshPoint {
  x: number;
  y: number;
}

export interface CoverTransform {
  /** Uniform scale applied to the video to cover the container. */
  scale: number;
  /** Left offset of the scaled video inside the container, in CSS pixels. */
  offsetX: number;
  /** Top offset of the scaled video inside the container, in CSS pixels. */
  offsetY: number;
  displayWidth: number;
  displayHeight: number;
}

/**
 * Replicates the CSS `object-fit: cover` layout so normalized landmark
 * coordinates can be projected onto the overlay canvas exactly where the
 * corresponding pixel is drawn.
 */
export function computeCoverTransform(
  videoWidth: number,
  videoHeight: number,
  containerWidth: number,
  containerHeight: number
): CoverTransform {
  if (videoWidth <= 0 || videoHeight <= 0) {
    return {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      displayWidth: containerWidth,
      displayHeight: containerHeight,
    };
  }

  const scale = Math.max(containerWidth / videoWidth, containerHeight / videoHeight);
  const displayWidth = videoWidth * scale;
  const displayHeight = videoHeight * scale;

  return {
    scale,
    offsetX: (containerWidth - displayWidth) / 2,
    offsetY: (containerHeight - displayHeight) / 2,
    displayWidth,
    displayHeight,
  };
}

/**
 * Projects a normalized (0..1) landmark into canvas pixel space.
 * `mirrored` matches the horizontally flipped preview the user sees.
 */
export function projectLandmark(
  point: MeshPoint,
  transform: CoverTransform,
  mirrored = true
): MeshPoint {
  const normalizedX = mirrored ? 1 - point.x : point.x;
  return {
    x: transform.offsetX + normalizedX * transform.displayWidth,
    y: transform.offsetY + point.y * transform.displayHeight,
  };
}

/**
 * Exponential smoothing between the previous rendered mesh and the newest
 * inference result. Inference runs at ~15 FPS while the overlay paints at
 * display rate, so without this the structure visibly stutters.
 */
export function smoothLandmarks(
  previous: MeshPoint[] | null,
  next: MeshPoint[],
  factor: number
): MeshPoint[] {
  if (!previous || previous.length !== next.length) {
    return next.map((p) => ({ x: p.x, y: p.y }));
  }
  const t = Math.min(Math.max(factor, 0), 1);
  const out: MeshPoint[] = new Array(next.length);
  for (let i = 0; i < next.length; i += 1) {
    out[i] = {
      x: previous[i].x + (next[i].x - previous[i].x) * t,
      y: previous[i].y + (next[i].y - previous[i].y) * t,
    };
  }
  return out;
}

export interface MeshBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

/** Axis-aligned bounds of a projected point set. */
export function meshBounds(points: MeshPoint[]): MeshBounds | null {
  if (points.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Position of the sweeping scan band, as a 0..1 fraction of the face height.
 * Sweeps top -> bottom then restarts, with a short pause between passes.
 */
export function scanBeamPosition(elapsedMs: number, periodMs = 2600): number {
  if (periodMs <= 0) return 0;
  const phase = (elapsedMs % periodMs) / periodMs;
  // Sweep occupies the first 80% of the cycle; the rest is a brief rest.
  const sweep = Math.min(phase / 0.8, 1);
  return sweep;
}

/** Visual accent used by the overlay, derived from live scan quality. */
export type MeshTone = "scanning" | "ready" | "warning";

export const MESH_TONE_COLORS: Record<
  MeshTone,
  { mesh: string; contour: string; beam: string; accent: string }
> = {
  scanning: {
    mesh: "rgba(56, 189, 248, 0.25)",
    contour: "rgba(186, 230, 253, 0.85)",
    beam: "rgba(56, 189, 248, 1)",
    accent: "#38bdf8",
  },
  ready: {
    mesh: "rgba(52, 211, 153, 0.3)",
    contour: "rgba(187, 247, 208, 0.9)",
    beam: "rgba(52, 211, 153, 1)",
    accent: "#34d399",
  },
  warning: {
    mesh: "rgba(56, 189, 248, 0.25)",
    contour: "rgba(125, 211, 252, 0.85)",
    beam: "rgba(56, 189, 248, 1)",
    accent: "#38bdf8",
  },
};
