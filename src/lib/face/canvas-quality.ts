import { LUMINANCE_MIN, LUMINANCE_MAX } from "./config";

/**
 * Canvas-backed blur and lighting scoring. These are pure functions over a
 * CanvasRenderingContext2D so they can run off the analysis canvas only.
 * Thresholds are configurable because camera resolution changes scale.
 */

/** Variance-of-Laplacian-like edge-strength score on the face crop. */
export function computeSharpness(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): number {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  if (data.length === 0) return 0;

  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }

  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const laplacian =
        4 * gray[idx] -
        gray[idx - 1] -
        gray[idx + 1] -
        gray[idx - width] -
        gray[idx + width];
      sum += laplacian;
      sumSq += laplacian * laplacian;
      count++;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  const variance = sumSq / count - mean * mean;
  // Normalize roughly; 0..1 scale where ~0 is blurry.
  return Math.min(1, Math.max(0, Math.sqrt(Math.max(0, variance)) / 100));
}

/** Mean normalized luminance over the crop. */
export function computeLuminance(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): number {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  if (data.length === 0) return 0;

  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return sum / (data.length / 4) / 255;
}

export function isLuminanceValid(luminance: number): boolean {
  return luminance >= LUMINANCE_MIN && luminance <= LUMINANCE_MAX;
}
