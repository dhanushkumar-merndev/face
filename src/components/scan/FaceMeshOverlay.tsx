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
 * Draws the live face structure — full tessellation mesh, feature contours,
 * a sweeping scan band, and a high-tech biometric face guide oval.
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

  // Load landmark connection tables from MediaPipe
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
        // Overlay is decorative
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

      const elapsed = now - start;
      const frame = source.current;
      const colors = MESH_TONE_COLORS[toneRef.current];
      const hasFace = Boolean(frame && frame.landmarks.length > 0);

      // Always draw the biometric guide overlay
      drawBiometricGuide(ctx, width, height, elapsed, colors, toneRef.current, hasFace, reduceMotion);

      if (!frame || frame.landmarks.length === 0) {
        smoothed = null;
        return;
      }

      const transform = computeCoverTransform(
        frame.videoWidth,
        frame.videoHeight,
        width,
        height
      );

      // Smoothing landmarks for high frame rate rendering
      smoothed = smoothLandmarks(smoothed, frame.landmarks, 0.4);
      const points = smoothed.map((p) => projectLandmark(p, transform, true));
      const bounds = meshBounds(points);
      if (!bounds) return;

      const meshPath = buildPath(points, sets.tesselation);
      const contourPath = buildPath(points, sets.contours);
      const irisPath = buildPath(points, sets.irises);

      // Base face mesh structure
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

      // Sweeping scan laser band across the face
      const sweep = reduceMotion ? 0.5 : scanBeamPosition(elapsed);
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

      // Vertex sparks inside the laser band
      ctx.fillStyle = colors.beam;
      for (let i = 0; i < points.length; i += 3) {
        const p = points[i];
        if (Math.abs(p.y - beamY) > bandHeight / 2) continue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Leading beam edge line
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

      // Draw tracking corner brackets on detected face
      drawTrackingBrackets(ctx, bounds, colors.accent);
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

/**
 * Draws a multi-layered, premium biometric face guide oval.
 * Features glowing ambient aura, rotating animated tech ring, precision ticks,
 * state-based color shifts (Cyan / Emerald Green / Amber Gold), and crosshair marks.
 */
function drawBiometricGuide(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  elapsedMs: number,
  colors: { mesh: string; contour: string; beam: string; accent: string },
  tone: MeshTone,
  hasFace: boolean,
  reduceMotion: boolean
) {
  const cx = width / 2;
  // Position slightly above center to naturally align with human selfie posture
  const cy = height * 0.44;

  const baseRx = Math.min(width, height) * 0.28;
  const rx = Math.max(120, Math.min(baseRx, 180));
  const ry = rx * 1.34;

  const pulse = reduceMotion ? 0 : Math.sin(elapsedMs / 700) * 0.02;
  const currentRx = rx * (1 + pulse);
  const currentRy = ry * (1 + pulse);

  ctx.save();

  // Layer 1: Outer Ambient Glow Aura
  ctx.shadowBlur = tone === "ready" ? 28 : tone === "warning" ? 22 : 18;
  ctx.shadowColor = colors.accent;
  ctx.strokeStyle = colors.accent;
  ctx.globalAlpha = tone === "ready" ? 0.85 : tone === "warning" ? 0.75 : 0.45;
  ctx.lineWidth = 1.5;

  // Outer dashed tech orbit ring
  ctx.save();
  ctx.setLineDash([8, 14]);
  ctx.lineDashOffset = reduceMotion ? 0 : -(elapsedMs / 25) % 22;
  ctx.beginPath();
  ctx.ellipse(cx, cy, currentRx + 12, currentRy + 12, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Layer 2: Primary Biometric Guide Oval
  ctx.lineWidth = tone === "ready" ? 3.5 : 2.5;
  ctx.globalAlpha = tone === "ready" ? 0.95 : 0.8;
  ctx.beginPath();
  ctx.ellipse(cx, cy, currentRx, currentRy, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Layer 3: Cardinal Crosshair Ticks (N, S, E, W)
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.9;
  const tickLen = 12;

  ctx.beginPath();
  // Top (North)
  ctx.moveTo(cx, cy - currentRy - tickLen);
  ctx.lineTo(cx, cy - currentRy + tickLen / 2);
  // Bottom (South)
  ctx.moveTo(cx, cy + currentRy - tickLen / 2);
  ctx.lineTo(cx, cy + currentRy + tickLen);
  // Left (West)
  ctx.moveTo(cx - currentRx - tickLen, cy);
  ctx.lineTo(cx - currentRx + tickLen / 2, cy);
  // Right (East)
  ctx.moveTo(cx + currentRx - tickLen / 2, cy);
  ctx.lineTo(cx + currentRx + tickLen, cy);
  ctx.stroke();

  // Layer 4: Searching Sweep Radar Arc (Active when looking for face)
  if (!hasFace && !reduceMotion) {
    const angle = (elapsedMs / 1200) * Math.PI * 2;
    const arcLength = Math.PI * 0.4;

    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = colors.beam;
    ctx.shadowBlur = 15;
    ctx.shadowColor = colors.beam;
    ctx.globalAlpha = 0.85;

    ctx.beginPath();
    ctx.ellipse(cx, cy, currentRx, currentRy, 0, angle, angle + arcLength);
    ctx.stroke();
    ctx.restore();
  }

  // Layer 5: Corner Frame Brackets around the Biometric Guide Zone
  const pad = 24;
  const bx0 = cx - currentRx - pad;
  const by0 = cy - currentRy - pad;
  const bx1 = cx + currentRx + pad;
  const by1 = cy + currentRy + pad;
  const bLen = 22;

  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  // Top-Left
  ctx.moveTo(bx0, by0 + bLen);
  ctx.lineTo(bx0, by0);
  ctx.lineTo(bx0 + bLen, by0);
  // Top-Right
  ctx.moveTo(bx1 - bLen, by0);
  ctx.lineTo(bx1, by0);
  ctx.lineTo(bx1, by0 + bLen);
  // Bottom-Right
  ctx.moveTo(bx1, by1 - bLen);
  ctx.lineTo(bx1, by1);
  ctx.lineTo(bx1 - bLen, by1);
  // Bottom-Left
  ctx.moveTo(bx0 + bLen, by1);
  ctx.lineTo(bx0, by1);
  ctx.lineTo(bx0, by1 - bLen);
  ctx.stroke();

  ctx.restore();
}

/** Dynamic tracking brackets directly framing detected landmarks */
function drawTrackingBrackets(
  ctx: CanvasRenderingContext2D,
  bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number },
  color: string
) {
  const pad = Math.max(16, bounds.width * 0.12);
  const x0 = bounds.minX - pad;
  const y0 = bounds.minY - pad;
  const x1 = bounds.maxX + pad;
  const y1 = bounds.maxY + pad;
  const len = Math.min(24, bounds.width * 0.2);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.85;
  ctx.shadowBlur = 8;
  ctx.shadowColor = color;

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

  ctx.restore();
}
