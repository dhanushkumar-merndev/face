"use client";

import { useEffect, useRef, useState } from "react";
import {
  computeCoverTransform,
  projectLandmark,
  smoothLandmarks,
  meshBounds,
  scanBeamPosition,
  MESH_TONE_COLORS,
  type MeshConnection,
  type MeshPoint,
  type MeshTone,
} from "@/lib/face/mesh";

/**
 * The latest inference result, written by the scanner on every frame.
 * Passed as a ref so 15 FPS of landmark data never triggers a React render.
 */
export interface MeshFrame {
  landmarks: MeshPoint[];
  videoWidth: number;
  videoHeight: number;
}

interface ConnectionSets {
  tesselation: MeshConnection[];
  contours: MeshConnection[];
  irises: MeshConnection[];
}

/**
 * Draws the live face structure — full tessellation mesh, feature contours and
 * a sweeping scan band — onto a canvas layered over the mirrored camera feed.
 */
export function FaceMeshOverlay({
  source,
  tone = "scanning",
  className,
}: {
  source: React.RefObject<MeshFrame | null>;
  tone?: MeshTone;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [sets, setSets] = useState<ConnectionSets | null>(null);
  const toneRef = useRef<MeshTone>(tone);

  useEffect(() => {
    toneRef.current = tone;
  }, [tone]);

  // The landmark connection tables are static data on the MediaPipe class; the
  // module itself is already loaded by the scanner by the time this runs.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const FL = vision.FaceLandmarker;
        if (cancelled) return;
        setSets({
          tesselation: FL.FACE_LANDMARKS_TESSELATION as MeshConnection[],
          contours: [
            ...(FL.FACE_LANDMARKS_FACE_OVAL as MeshConnection[]),
            ...(FL.FACE_LANDMARKS_LEFT_EYE as MeshConnection[]),
            ...(FL.FACE_LANDMARKS_RIGHT_EYE as MeshConnection[]),
            ...(FL.FACE_LANDMARKS_LEFT_EYEBROW as MeshConnection[]),
            ...(FL.FACE_LANDMARKS_RIGHT_EYEBROW as MeshConnection[]),
            ...(FL.FACE_LANDMARKS_LIPS as MeshConnection[]),
          ],
          irises: [
            ...(FL.FACE_LANDMARKS_LEFT_IRIS as MeshConnection[]),
            ...(FL.FACE_LANDMARKS_RIGHT_IRIS as MeshConnection[]),
          ],
        });
      } catch {
        // Overlay is decorative: if the tables fail to load the scan still works.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sets) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    let running = true;
    let smoothed: MeshPoint[] | null = null;
    const start = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { width, height };
    };

    const draw = (now: number) => {
      if (!running) return;
      raf = requestAnimationFrame(draw);

      const { width, height } = resize();
      ctx.clearRect(0, 0, width, height);

      const frame = source.current;
      const colors = MESH_TONE_COLORS[toneRef.current];

      if (!frame || frame.landmarks.length === 0) {
        smoothed = null;
        drawSearchReticle(ctx, width, height, now - start, colors.accent, reduceMotion);
        return;
      }

      const transform = computeCoverTransform(
        frame.videoWidth,
        frame.videoHeight,
        width,
        height
      );

      // Inference is ~15 FPS; smoothing keeps the structure fluid at display rate.
      smoothed = smoothLandmarks(smoothed, frame.landmarks, 0.4);
      const points = smoothed.map((p) => projectLandmark(p, transform, true));
      const bounds = meshBounds(points);
      if (!bounds) return;

      const meshPath = buildPath(points, sets.tesselation);
      const contourPath = buildPath(points, sets.contours);
      const irisPath = buildPath(points, sets.irises);

      // Base structure.
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.strokeStyle = colors.mesh;
      ctx.lineWidth = 0.7;
      ctx.stroke(meshPath);

      ctx.strokeStyle = colors.contour;
      ctx.lineWidth = 1.4;
      ctx.stroke(contourPath);

      ctx.strokeStyle = colors.contour;
      ctx.lineWidth = 1.2;
      ctx.stroke(irisPath);

      // Sweeping scan band: the same structure restroked brightly inside a
      // clipped horizontal slice that travels down the face.
      const sweep = reduceMotion ? 0.5 : scanBeamPosition(now - start);
      const bandHeight = Math.max(26, bounds.height * 0.16);
      const beamY = bounds.minY - bandHeight + sweep * (bounds.height + bandHeight * 2);

      ctx.save();
      ctx.beginPath();
      ctx.rect(bounds.minX - 24, beamY - bandHeight / 2, bounds.width + 48, bandHeight);
      ctx.clip();

      ctx.shadowBlur = 14;
      ctx.shadowColor = colors.beam;
      ctx.strokeStyle = colors.beam;
      ctx.lineWidth = 1.1;
      ctx.stroke(meshPath);
      ctx.lineWidth = 1.8;
      ctx.stroke(contourPath);
      ctx.shadowBlur = 0;

      // Vertex sparks inside the band.
      ctx.fillStyle = colors.beam;
      for (let i = 0; i < points.length; i += 3) {
        const p = points[i];
        if (Math.abs(p.y - beamY) > bandHeight / 2) continue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Leading edge of the band.
      const edge = ctx.createLinearGradient(bounds.minX, 0, bounds.maxX, 0);
      edge.addColorStop(0, "transparent");
      edge.addColorStop(0.5, colors.beam);
      edge.addColorStop(1, "transparent");
      ctx.strokeStyle = edge;
      ctx.lineWidth = 1.6;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(bounds.minX - 20, beamY);
      ctx.lineTo(bounds.maxX + 20, beamY);
      ctx.stroke();
      ctx.globalAlpha = 1;

      drawBrackets(ctx, bounds, colors.accent);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
    };
  }, [sets, source]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
      style={{ width: "100%", height: "100%" }}
    />
  );
}

function buildPath(points: MeshPoint[], connections: MeshConnection[]): Path2D {
  const path = new Path2D();
  for (const c of connections) {
    const a = points[c.start];
    const b = points[c.end];
    if (!a || !b) continue;
    path.moveTo(a.x, a.y);
    path.lineTo(b.x, b.y);
  }
  return path;
}

/** Tracking brackets around the detected face. */
function drawBrackets(
  ctx: CanvasRenderingContext2D,
  bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number },
  color: string
) {
  const pad = Math.max(16, bounds.width * 0.12);
  const x0 = bounds.minX - pad;
  const y0 = bounds.minY - pad;
  const x1 = bounds.maxX + pad;
  const y1 = bounds.maxY + pad;
  const len = Math.min(28, bounds.width * 0.22);

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  // Top-left
  ctx.moveTo(x0, y0 + len);
  ctx.lineTo(x0, y0);
  ctx.lineTo(x0 + len, y0);
  // Top-right
  ctx.moveTo(x1 - len, y0);
  ctx.lineTo(x1, y0);
  ctx.lineTo(x1, y0 + len);
  // Bottom-right
  ctx.moveTo(x1, y1 - len);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x1 - len, y1);
  // Bottom-left
  ctx.moveTo(x0 + len, y1);
  ctx.lineTo(x0, y1);
  ctx.lineTo(x0, y1 - len);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Idle state: a pulsing target while no face is in view. */
function drawSearchReticle(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  elapsedMs: number,
  color: string,
  reduceMotion: boolean
) {
  const cx = width / 2;
  const cy = height / 2;
  const baseRx = Math.min(width, height) * 0.24;
  const pulse = reduceMotion ? 0 : Math.sin(elapsedMs / 620) * 0.04;
  const rx = baseRx * (1 + pulse);
  const ry = rx * 1.32;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 12]);
  ctx.lineDashOffset = reduceMotion ? 0 : -(elapsedMs / 28) % 22;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
