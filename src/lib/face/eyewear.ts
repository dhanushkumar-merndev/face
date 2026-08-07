/**
 * Image-based eyewear detection.
 *
 * The previous approach read the `eyeSquint` / `eyeBlink` blendshapes and
 * flagged glasses when squint was high and blink low. Those blendshapes
 * describe an *expression*, not eyewear: someone wearing glasses with a neutral
 * face scores near zero on squint and was never flagged, while someone
 * squinting into a bright window with bare eyes was. It could not work.
 *
 * This measures the picture instead. Glasses put a hard, roughly horizontal
 * structure across the eyes — rims, bridge and temple arms — so the band across
 * the eyes carries far more vertical luminance change than a comparable band of
 * bare cheek, and usually runs darker as well.
 *
 * It is still a heuristic. Rimless frames understate the signal, and heavy
 * shadow or a low camera exposure overstate it. The authoritative signal is
 * Rekognition's `Eyeglasses` / `Sunglasses` attribute, which the age pass
 * already requests but does not read.
 */

export interface BandMetrics {
  /** Mean luminance, 0-1. */
  luminance: number;
  /** Mean absolute vertical luminance gradient, 0-1. */
  edgeEnergy: number;
}

export interface EyewearMetrics {
  eye: BandMetrics;
  cheek: BandMetrics;
}

export interface EyewearVerdict {
  /** Eye-band edge energy over cheek-band edge energy. */
  edgeRatio: number;
  /**
   * How far the eye band's luminance sits from the cheek reference, in either
   * direction. Dark rims pull it down; coated lenses catching a window pull it
   * up. An earlier version required *darker* only, and never fired on anyone
   * whose lenses were reflecting.
   */
  luminanceDeviation: number;
  likely: boolean;
}

/**
 * Thresholds are deliberately conservative — a false positive blocks a user who
 * has done nothing wrong, which is worse than missing a pair of thin frames.
 * Calibrate against real captures: set NEXT_PUBLIC_SCAN_DEBUG=1 to read the
 * live ratios off the scanner, with and without glasses, then set these.
 */
export const EYEWEAR_EDGE_RATIO_MIN = 1.9;
export const EYEWEAR_LUMINANCE_DEVIATION_MIN = 0.05;

/** Guards the ratios against a near-black reference band. */
const EPSILON = 1e-4;

export function scoreEyewear(metrics: EyewearMetrics): EyewearVerdict {
  const edgeRatio = metrics.eye.edgeEnergy / Math.max(metrics.cheek.edgeEnergy, EPSILON);
  const luminanceRatio = metrics.eye.luminance / Math.max(metrics.cheek.luminance, EPSILON);
  const luminanceDeviation = Math.abs(luminanceRatio - 1);

  return {
    edgeRatio,
    luminanceDeviation,
    // Both signals must agree. Eyebrows and lashes alone push the edge ratio up,
    // so edge energy on its own is not enough to call it.
    likely:
      edgeRatio >= EYEWEAR_EDGE_RATIO_MIN &&
      luminanceDeviation >= EYEWEAR_LUMINANCE_DEVIATION_MIN,
  };
}

/**
 * Mean luminance and vertical gradient energy over one rectangle of a canvas.
 * Returns null when the rectangle falls outside the canvas or is too thin to
 * carry a gradient.
 */
export function measureBand(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number },
  canvasWidth: number,
  canvasHeight: number
): BandMetrics | null {
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const width = Math.floor(Math.min(rect.width, canvasWidth - x));
  const height = Math.floor(Math.min(rect.height, canvasHeight - y));
  if (width < 2 || height < 2) return null;

  const { data } = ctx.getImageData(x, y, width, height);

  // Rec. 601 luma, matching the luminance check used elsewhere in the scanner.
  const luma = new Float32Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const p = i * 4;
    luma[i] = (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) / 255;
  }

  let sum = 0;
  for (let i = 0; i < luma.length; i += 1) sum += luma[i];

  let gradient = 0;
  let samples = 0;
  for (let row = 0; row < height - 1; row += 1) {
    for (let col = 0; col < width; col += 1) {
      gradient += Math.abs(luma[(row + 1) * width + col] - luma[row * width + col]);
      samples += 1;
    }
  }

  return {
    luminance: sum / luma.length,
    edgeEnergy: samples > 0 ? gradient / samples : 0,
  };
}
