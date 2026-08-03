import {
  BEST_FRAME_JPEG_QUALITY,
  BEST_FRAME_MAX_DIMENSION,
  BEST_FRAME_CROP_MARGIN_RATIO,
  THUMBNAIL_SIZE,
} from "@/lib/face/config";
import type { FaceBox } from "@/lib/face/types";

/**
 * Captures the best frontal frame from the ORIGINAL video resolution (never
 * from the low-res analysis canvas), crops the face with margin, and encodes
 * as a high-quality JPEG.
 */

export function loadImageFromVideo(video: HTMLVideoElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Crop a face box with margin and scale down to max dimension. Returns a
 * canvas whose image data is ready for JPEG encoding.
 */
export function cropFaceCanvas(
  source: HTMLCanvasElement,
  faceBox: FaceBox,
  options?: { maxDimension?: number; marginRatio?: number }
): HTMLCanvasElement {
  const maxDimension = options?.maxDimension ?? BEST_FRAME_MAX_DIMENSION;
  const marginRatio = options?.marginRatio ?? BEST_FRAME_CROP_MARGIN_RATIO;

  let x = faceBox.x;
  let y = faceBox.y;
  let w = faceBox.width;
  let h = faceBox.height;

  // Expand by margin, keeping inside the source bounds.
  x = Math.max(0, x - w * marginRatio);
  y = Math.max(0, y - h * marginRatio);
  w = Math.min(source.width - x, w * (1 + marginRatio * 2));
  h = Math.min(source.height - y, h * (1 + marginRatio * 2));

  const scale = Math.min(1, maxDimension / Math.max(w, h));
  const outW = Math.round(w * scale);
  const outH = Math.round(h * scale);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  ctx.drawImage(source, x, y, w, h, 0, 0, outW, outH);
  return canvas;
}

export function canvasToJpeg(canvas: HTMLCanvasElement, quality = BEST_FRAME_JPEG_QUALITY): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("JPEG encoding failed."))),
      "image/jpeg",
      quality
    );
  });
}

export function makeThumbnail(source: HTMLCanvasElement): HTMLCanvasElement {
  const size = THUMBNAIL_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  // Center-crop to square.
  const srcSize = Math.min(source.width, source.height);
  const sx = (source.width - srcSize) / 2;
  const sy = (source.height - srcSize) / 2;
  ctx.drawImage(source, sx, sy, srcSize, srcSize, 0, 0, size, size);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Image encoding failed."))),
      "image/jpeg",
      BEST_FRAME_JPEG_QUALITY
    );
  });
}

export { clamp };
