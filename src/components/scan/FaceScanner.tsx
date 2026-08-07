"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { FaceLandmarker } from "@mediapipe/tasks-vision";
import { X } from "lucide-react";
import {
  SCAN_CONFIG,
  CHALLENGE_SEQUENCE,
  TARGET_INFERENCE_INTERVAL_MS,
  MAX_RECORDING_DURATION_MS,
  MAX_VIDEO_UPLOAD_BYTES,
} from "@/lib/face/config";
import type { FaceInfo, QualityMessage, ChallengeStep } from "@/lib/face/types";
import { matrixToHeadPose } from "@/lib/face/pose";
import { reducer, initialState } from "@/lib/face/challenge-reducer";
import { STEP_CONDITIONS } from "@/lib/face/quality";
import { computeFrameScore } from "@/lib/face/frame-score";
import { computeSharpness, computeLuminance } from "@/lib/face/canvas-quality";
import { measureBand, scoreEyewear } from "@/lib/face/eyewear";
import { insideGuideRatio, MIN_INSIDE_GUIDE_RATIO, type GuideEllipse } from "@/lib/face/guide";
import type { MeshTone } from "@/lib/face/mesh";
import { startSegmentRecorder, type SegmentRecorder, type RecordingSession } from "@/lib/scan/media-recorder";
import { loadImageFromVideo, cropFaceCanvas, canvasToJpeg } from "@/lib/scan/best-frame";
import { scanApi } from "@/lib/scan/api";
import { clearActiveSession } from "@/lib/storage/scan-storage";
import { uploadCaptures, type CaptureUpload } from "@/lib/scan/upload";
import { CameraPreview } from "./CameraPreview";
import { FaceMeshOverlay, type MeshFrame } from "./FaceMeshOverlay";
import { DirectionInstruction } from "./DirectionInstruction";
import { ScanProgress } from "./ScanProgress";
import { UploadProgress } from "./UploadProgress";
import { TurnCue } from "./TurnCue";
import { Button } from "@/components/ui/button";

type ScanPhase = "preparing" | "active" | "uploading" | "done" | "error";

interface CapturedFrame {
  blob: Blob;
  width: number;
  height: number;
  score: number;
}

const EMPTY_SCORES: Record<ChallengeStep, number> = { CENTER: 0, LEFT: 0, RIGHT: 0 };

/** At most one full-resolution still encode per this interval, per direction. */
const CAPTURE_THROTTLE_MS = 140;

/**
 * Consecutive flagged frames before eyewear is called. At ~15 FPS this is about
 * half a second of agreement, which a blink or a head wobble cannot fake.
 */
const EYEWEAR_CONSECUTIVE_FRAMES = 8;

/**
 * Set NEXT_PUBLIC_SCAN_DEBUG=1 to show the live eyewear measurements on the
 * scanner. The thresholds in lib/face/eyewear.ts can only be set properly by
 * reading these off a real face, with and without glasses.
 */
const SCAN_DEBUG = process.env.NEXT_PUBLIC_SCAN_DEBUG === "1";
const EYEWEAR_DEBUG_INTERVAL_MS = 400;

/**
 * Grace period after the last clip for outstanding still encodes to land before
 * the recovery pass steps in. Long enough that a slow phone finishes on its own.
 */
const FRAME_RECOVERY_GRACE_MS = 2500;

export function FaceScanner({
  sessionId,
  onResult,
  onExit,
}: {
  sessionId?: string;
  onResult?: (result: { ageRange: { low: number; high: number } | null; sessionId: string }) => void;
  onExit?: () => void;
}) {
  const [phase, setPhase] = useState<ScanPhase>("preparing");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [qualityMessage, setQualityMessage] = useState<QualityMessage | null>(null);
  const [uploadIndex, setUploadIndex] = useState(0);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [landmarker, setLandmarker] = useState<FaceLandmarker | null>(null);
  const [landmarkerError, setLandmarkerError] = useState<string | null>(null);
  const [faceCentered, setFaceCentered] = useState(false);
  const [recordingStep, setRecordingStep] = useState<ChallengeStep | null>(null);
  const [capturedSteps, setCapturedSteps] = useState<ChallengeStep[]>([]);
  const [flashStep, setFlashStep] = useState<ChallengeStep | null>(null);
  const [cameraWarning, setCameraWarning] = useState<string | null>(null);

  // Temporary on-screen debug log for mobile
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const pushLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString();
    setDebugLog((prev) => [...prev.slice(-30), `[${ts}] ${msg}`]);
  }, []);

  const [state, dispatch] = useReducer(reducer, undefined, () => initialState);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const meshFrameRef = useRef<MeshFrame | null>(null);
  /** Most recent detected face, used to crop a fallback still. */
  const lastFaceRef = useRef<FaceInfo | null>(null);

  // Readiness has to be state, not just the ref: the inference loop cannot
  // start until the video element exists, and a ref assignment does not
  // re-render, so the loop would never learn that it arrived.
  const [videoReady, setVideoReady] = useState(false);
  const handleVideoReady = useCallback((video: HTMLVideoElement) => {
    videoRef.current = video;
    setVideoReady(true);
  }, []);

  // Per-direction capture buffers.
  const segmentsRef = useRef<Partial<Record<ChallengeStep, RecordingSession>>>({});
  const framesRef = useRef<Partial<Record<ChallengeStep, CapturedFrame>>>({});
  const captureScoreRef = useRef<Record<ChallengeStep, number>>({ ...EMPTY_SCORES });
  const lastCaptureAtRef = useRef<Record<ChallengeStep, number>>({ ...EMPTY_SCORES });
  const pendingEncodesRef = useRef<Promise<unknown>[]>([]);
  const activeRecorderRef = useRef<{ step: ChallengeStep; rec: SegmentRecorder } | null>(null);

  const lastInferenceRef = useRef(0);
  const rafRef = useRef(0);
  const scanStartRef = useRef<number | null>(null);
  const mediaSessionIdRef = useRef(sessionId);
  const resultSentRef = useRef(false);
  const uploadStartedRef = useRef(false);
  const recordingAnnouncedRef = useRef(false);
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null);
  /** The oval the overlay is drawing, in normalized video coordinates. */
  const guideRef = useRef<GuideEllipse | null>(null);
  /** Consecutive frames the eyewear check has agreed on. */
  const eyewearFlagRef = useRef(0);
  const [eyewearDebug, setEyewearDebug] = useState<string | null>(null);
  const eyewearDebugAtRef = useRef(0);

  // Session id may arrive asynchronously from the parent.
  useEffect(() => {
    mediaSessionIdRef.current = sessionId;
  }, [sessionId]);

  // -------------------------------------------------------------------------
  // MediaPipe setup
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const wasmBaseUrl = process.env.NEXT_PUBLIC_WASM_BASE_URL || "/mediapipe/wasm";
        const modelPath = process.env.NEXT_PUBLIC_MODEL_PATH || "/models/face_landmarker.task";

        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks(wasmBaseUrl);
        let lm: FaceLandmarker;
        try {
          lm = await vision.FaceLandmarker.createFromOptions(fileset, {
            baseOptions: {
              modelAssetPath: modelPath,
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            numFaces: 2,
            outputFaceBlendshapes: true,
            outputFacialTransformationMatrixes: true,
            minFaceDetectionConfidence: 0.5,
            minFacePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
        } catch (gpuErr) {
          console.warn("MediaPipe GPU delegate failed, trying CPU fallback:", gpuErr);
          lm = await vision.FaceLandmarker.createFromOptions(fileset, {
            baseOptions: {
              modelAssetPath: modelPath,
              delegate: "CPU",
            },
            runningMode: "VIDEO",
            numFaces: 2,
            outputFaceBlendshapes: true,
            outputFacialTransformationMatrixes: true,
            minFaceDetectionConfidence: 0.5,
            minFacePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
        }
        if (!cancelled) {
          setLandmarker(lm);
          pushLog(`MediaPipe loaded (delegate ready)`);
        }
      } catch (err) {
        console.error("Failed to load FaceLandmarker:", err);
        if (!cancelled) setLandmarkerError("Face model failed to load.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pushLog]);

  // -------------------------------------------------------------------------
  // Camera request
  // -------------------------------------------------------------------------
  const startCamera = useCallback(async () => {
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
        },
      });
      streamRef.current = media;
      setStream(media);
      setCameraError(null);
      pushLog(`Camera started`);

      // Check actual camera resolution and warn if below 720p
      const videoTrack = media.getVideoTracks()[0];
      if (videoTrack) {
        const settings = videoTrack.getSettings();
        const w = settings.width ?? 0;
        const h = settings.height ?? 0;
        const minDim = Math.min(w, h);
        const maxDim = Math.max(w, h);
        if (maxDim < 1280 || minDim < 720) {
          if (maxDim < 640 || minDim < 480) {
            setCameraWarning(
              `Very low camera quality detected (${w}×${h}). Results may be inaccurate. Try using a device with a better camera.`
            );
          } else {
            setCameraWarning(
              `Camera resolution is ${w}×${h}. For best results, use a device with at least 720p resolution.`
            );
          }
        }
      }
    } catch (err) {
      const name = (err as { name?: string }).name;
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setCameraError(
          "Camera permission was denied. Open your browser settings, allow camera access for this site, then reload and try again."
        );
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setCameraError("No camera was found on this device.");
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        setCameraError("The camera is already in use by another application. Close it and try again.");
      } else if (name === "OverconstrainedError") {
        setCameraError("The requested camera settings are not available.");
      } else {
        setCameraError("Could not access the camera. Please try again.");
      }
      setPhase("error");
    }
  }, [pushLog]);

  // -------------------------------------------------------------------------
  // Per-direction still capture, taken at full video resolution.
  // -------------------------------------------------------------------------
  const captureFrameFor = useCallback(
    (step: ChallengeStep, video: HTMLVideoElement, face: FaceInfo, score: number) => {
      const now = performance.now();
      if (now - lastCaptureAtRef.current[step] < CAPTURE_THROTTLE_MS) return;
      lastCaptureAtRef.current[step] = now;

      try {
        const original = loadImageFromVideo(video);
        const cropped = cropFaceCanvas(original, face.box);
        const encode = canvasToJpeg(cropped).then((blob) => {
          const existing = framesRef.current[step];
          // A later encode may resolve out of order; keep the best score.
          if (!existing || score >= existing.score) {
            framesRef.current[step] = { blob, width: cropped.width, height: cropped.height, score };
          }
        });
        pendingEncodesRef.current.push(encode);
        void encode.catch(() => {});
      } catch (err) {
        console.error(err);
      }
    },
    []
  );

  /**
   * Last-resort still for a direction that finished its hold without one.
   *
   * The per-direction still is captured opportunistically, only from frames
   * that satisfy STEP_CONDITIONS — which includes `qualityOk`. Turning the head
   * is exactly when quality drops, so on a phone a whole hold window can pass
   * with every frame rejected for motion blur. The clip still records and the
   * step still ticks green, but no still is ever encoded, and `maybeStartUpload`
   * then waits on a frame that will never arrive until the watchdog reports a
   * bogus "scan took too long".
   *
   * Quality is deliberately not consulted here: a slightly soft frame is worth
   * far more than a dead scan.
   */
  const captureFallbackFrame = useCallback((step: ChallengeStep): Promise<void> => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return Promise.resolve();

    try {
      const original = loadImageFromVideo(video);
      const face = lastFaceRef.current;
      // Crop to the last known face when there is one; otherwise keep the full
      // frame, which analysis can still work with.
      const canvas = face ? cropFaceCanvas(original, face.box) : original;
      return canvasToJpeg(canvas)
        .then((blob) => {
          if (!framesRef.current[step]) {
            framesRef.current[step] = {
              blob,
              width: canvas.width,
              height: canvas.height,
              score: 0,
            };
          }
        })
        .catch(() => {});
    } catch {
      return Promise.resolve();
    }
  }, []);

  // -------------------------------------------------------------------------
  // runInference — defined before the loop that uses it.
  // -------------------------------------------------------------------------
  const runInference = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const lm = landmarker;
    if (!lm) return;

    let result;
    try {
      result = lm.detectForVideo(video, performance.now());
    } catch {
      // MediaPipe can throw on the very first frame, before the graph has warmed
      // up. Safe to skip this frame.
      //
      // This does not catch the "Created TensorFlow Lite XNNPACK delegate for
      // CPU" line the dev overlay reports here — that is the WASM module
      // flushing stderr through console.error, not a thrown exception, so it
      // never reaches this handler. It is an INFO message and is expected:
      // MediaPipe always runs the blendshapes graph on CPU.
      return;
    }

    const faces = result.faceLandmarks ?? [];
    const matrices = result.facialTransformationMatrixes ?? [];

    const frameWidth = video.videoWidth || 1280;
    const frameHeight = video.videoHeight || 720;
    const faceCount = faces.length;

    let face: FaceInfo | undefined;
    let pose = { yaw: 0, pitch: 0, roll: 0 };
    let luminance: number | undefined;
    let sharpness: number | undefined;
    let qualityMessage: QualityMessage = faceCount === 0 ? "no_face" : faceCount > 1 ? "multiple_faces" : "ok";

    // Feed the structure overlay even when quality is poor, so the user can
    // see the mesh lock on while they adjust.
    // Dimensions are published even with no face, so the overlay can project
    // the guide through the same cover transform from the very first frame
    // instead of snapping into place once a face appears.
    meshFrameRef.current = {
      landmarks: faceCount >= 1 ? faces[0].map((p) => ({ x: p.x, y: p.y })) : [],
      videoWidth: frameWidth,
      videoHeight: frameHeight,
    };

    if (faceCount === 1) {
      const lm0 = faces[0];
      const matrix = matrices[0]?.data;
      pose = matrix ? matrixToHeadPose(matrix) : pose;

      let minX = 1, minY = 1, maxX = 0, maxY = 0;
      for (const pt of lm0) {
        minX = Math.min(minX, pt.x);
        minY = Math.min(minY, pt.y);
        maxX = Math.max(maxX, pt.x);
        maxY = Math.max(maxY, pt.y);
      }
      const box = {
        x: minX * frameWidth,
        y: minY * frameHeight,
        width: (maxX - minX) * frameWidth,
        height: (maxY - minY) * frameHeight,
      };

      face = {
        confidence: 1,
        box,
        landmarks: lm0.map((p) => ({ x: p.x, y: p.y })),
      };
      lastFaceRef.current = face;

      // Exposure and blur are sampled from the face region only. Measuring the
      // whole frame made desktop webcams unusable: a window or lamp behind the
      // subject dominates the average and pins the scan on "improve lighting",
      // and squashing a wide 16:9 frame down to 160px wipes out the edge detail
      // the sharpness score depends on, pinning it on "hold steady". A phone
      // held at arm's length hides both because the face fills the frame.
      const cropMargin = 0.15;
      const cropX = Math.max(0, box.x - box.width * cropMargin);
      const cropY = Math.max(0, box.y - box.height * cropMargin);
      const cropW = Math.min(frameWidth - cropX, box.width * (1 + cropMargin * 2));
      const cropH = Math.min(frameHeight - cropY, box.height * (1 + cropMargin * 2));

      if (cropW >= 16 && cropH >= 16) {
        const targetW = 160;
        const targetH = Math.max(1, Math.round((cropH / cropW) * targetW));
        if (!analysisCanvasRef.current) {
          analysisCanvasRef.current = document.createElement("canvas");
        }
        const analysis = analysisCanvasRef.current;
        if (analysis.width !== targetW) analysis.width = targetW;
        if (analysis.height !== targetH) analysis.height = targetH;
        const ctx = analysis.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, targetW, targetH);
          luminance = computeLuminance(ctx, targetW, targetH);
          sharpness = computeSharpness(ctx, targetW, targetH);

          // Eyewear check. Landmarks are normalised to the video frame, so they
          // are mapped through the same crop that produced this canvas.
          const toCanvas = (point: { x: number; y: number }) => ({
            x: ((point.x * frameWidth - cropX) / cropW) * targetW,
            y: ((point.y * frameHeight - cropY) / cropH) * targetH,
          });

          // 33/263 outer eye corners, 105/334 brow tops, 145/374 under-eye,
          // 2 nose base — the cheek reference sits between the eyes and nose.
          const outerL = toCanvas(lm0[33]);
          const outerR = toCanvas(lm0[263]);
          const browTop = Math.min(toCanvas(lm0[105]).y, toCanvas(lm0[334]).y);
          const underEye = Math.max(toCanvas(lm0[145]).y, toCanvas(lm0[374]).y);
          const noseBase = toCanvas(lm0[2]).y;

          const bandX = Math.min(outerL.x, outerR.x);
          const bandWidth = Math.abs(outerR.x - outerL.x);
          const eyeHeight = underEye - browTop;
          const cheekTop = underEye + eyeHeight * 0.25;

          const eye =
            eyeHeight > 1
              ? measureBand(
                  ctx,
                  { x: bandX, y: browTop, width: bandWidth, height: eyeHeight },
                  targetW,
                  targetH
                )
              : null;
          const cheek =
            noseBase > cheekTop
              ? measureBand(
                  ctx,
                  {
                    x: bandX,
                    y: cheekTop,
                    width: bandWidth,
                    height: noseBase - cheekTop,
                  },
                  targetW,
                  targetH
                )
              : null;

          if (eye && cheek) {
            const verdict = scoreEyewear({ eye, cheek });
            const wasFlagged = eyewearFlagRef.current >= EYEWEAR_CONSECUTIVE_FRAMES;
            // Require agreement across frames: a single blink or head wobble
            // should never be enough to accuse someone of wearing glasses.
            eyewearFlagRef.current = verdict.likely
              ? Math.min(EYEWEAR_CONSECUTIVE_FRAMES, eyewearFlagRef.current + 1)
              : 0;
            const isFlagged = eyewearFlagRef.current >= EYEWEAR_CONSECUTIVE_FRAMES;
            if (isFlagged !== wasFlagged) {
              pushLog(
                `eyewear ${isFlagged ? "detected" : "cleared"} — edge ${verdict.edgeRatio.toFixed(2)}x, dev ${verdict.luminanceDeviation.toFixed(3)}`
              );
            }

            // Live readout for threshold calibration. Throttled: this is the
            // only setState on the 15 FPS inference path.
            if (SCAN_DEBUG) {
              const now = performance.now();
              if (now - eyewearDebugAtRef.current > EYEWEAR_DEBUG_INTERVAL_MS) {
                eyewearDebugAtRef.current = now;
                setEyewearDebug(
                  `edge ${verdict.edgeRatio.toFixed(2)}x · dev ${verdict.luminanceDeviation.toFixed(3)} · ${
                    verdict.likely ? "HIT" : "miss"
                  } ${eyewearFlagRef.current}/${EYEWEAR_CONSECUTIVE_FRAMES}`
                );
              }
            }
          }
        }
      }

      const area = frameWidth * frameHeight;
      const ratio = (box.width * box.height) / area;
      if (ratio < SCAN_CONFIG.faceAreaMinRatio) qualityMessage = "move_closer";
      else if (ratio > SCAN_CONFIG.faceAreaMaxRatio) qualityMessage = "move_farther";
      // Containment in the oval the user can actually see, rather than a
      // separate invisible box that let an off-frame face record. The overlay
      // publishes its drawn geometry; the default covers the first few frames.
      else if (insideGuideRatio(lm0, guideRef.current ?? undefined) < MIN_INSIDE_GUIDE_RATIO) {
        qualityMessage = "center_face";
      } else if (luminance !== undefined && (luminance < 0.2 || luminance > 0.85)) {
        qualityMessage = "improve_lighting";
      } else if (sharpness !== undefined && sharpness < 0.02) {
        qualityMessage = "hold_steady";
      } else if (eyewearFlagRef.current >= EYEWEAR_CONSECUTIVE_FRAMES) {
        qualityMessage = "obstruction_detected";
      }
    }

    const qualityOk = qualityMessage === "ok";
    setQualityMessage(qualityMessage);
    if (qualityOk && face && phase === "preparing") {
      setFaceCentered(true);
    }

    // Each direction keeps its own best still, captured only from frames that
    // actually satisfy that direction.
    const currentStep = stateRef.current.currentStep;
    if (currentStep && face && faceCount === 1) {
      const passes = STEP_CONDITIONS[currentStep]({
        pose,
        face,
        frameWidth,
        frameHeight,
        faceCount,
        qualityOk,
      });
      if (passes) {
        const score = computeFrameScore({
          pose,
          face,
          frameWidth,
          frameHeight,
          quality: { ok: qualityOk, message: qualityMessage },
          sharpness: sharpness ?? 0,
          luminance: luminance ?? 0.5,
        });
        if (score > captureScoreRef.current[currentStep]) {
          captureScoreRef.current[currentStep] = score;
          captureFrameFor(currentStep, video, face, score);
        }
      }
    }

    const elapsedMs = scanStartRef.current ? performance.now() - scanStartRef.current : 0;

    dispatch({
      type: "FRAME",
      payload: {
        timestampMs: elapsedMs,
        elapsedMs,
        faceCount,
        face,
        pose,
        qualityMessage,
        qualityOk,
        luminance,
        sharpness,
        frameWidth,
        frameHeight,
      },
    });
  }, [landmarker, phase, captureFrameFor, pushLog]);

  // -------------------------------------------------------------------------
  // Inference loop — starts when camera + model are ready.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (phase !== "preparing" && phase !== "active") return;
    if (!landmarker || !videoReady || !videoRef.current) return;

    let running = true;

    const loop = () => {
      if (!running) return;
      const now = performance.now();
      if (now - lastInferenceRef.current >= TARGET_INFERENCE_INTERVAL_MS) {
        lastInferenceRef.current = now;
        runInference();
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [phase, landmarker, videoReady, runInference]);

  const countdownStartedRef = useRef(false);

  // The `active` watchdog does not cover `preparing`, so a quality check that
  // never clears (soft webcam, harsh backlight) would otherwise leave the user
  // on "Calibrating scanner" indefinitely. Offer a manual start instead.
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    if (phase !== "preparing" || !stream || !landmarker || faceCentered) return;
    const id = setTimeout(() => setStalled(true), 12_000);
    return () => clearTimeout(id);
  }, [phase, stream, landmarker, faceCentered]);

  const startAnyway = useCallback(() => {
    pushLog("Manual start (quality gate bypassed)");
    setFaceCentered(true);
  }, [pushLog]);

  // -------------------------------------------------------------------------
  // Countdown when camera + model ready and face is centered.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (phase === "preparing" && stream && landmarker && faceCentered && !countdownStartedRef.current) {
      countdownStartedRef.current = true;
      let remaining = Math.ceil(SCAN_CONFIG.countdownMs / 1000);
      setCountdown(remaining);

      const id = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          clearInterval(id);
          setCountdown(null);
          scanStartRef.current = performance.now();
          dispatch({ type: "COUNTDOWN_FINISHED" });
          setPhase("active");
        } else {
          setCountdown(remaining);
        }
      }, 1000);

      return () => {
        clearInterval(id);
      };
    }
  }, [phase, stream, landmarker, faceCentered]);

  // -------------------------------------------------------------------------
  // Upload + analysis
  // -------------------------------------------------------------------------
  const runUpload = useCallback(async () => {
    const sid = mediaSessionIdRef.current;
    if (!sid) {
      setPhase("error");
      setCameraError("Scan session was not created.");
      return;
    }

    setPhase("uploading");
    setUploadIndex(0);
    setUploadFailed(false);
    pushLog(`Upload started for session ${sid}`);

    try {
      // Still encoding runs off the inference loop; let it settle.
      await Promise.allSettled(pendingEncodesRef.current);

      const captures = CHALLENGE_SEQUENCE.map((step) => ({
        step,
        segment: segmentsRef.current[step],
        frame: framesRef.current[step],
      }));

      const incomplete = captures.find((c) => !c.segment || c.segment.blob.size === 0 || !c.frame);
      if (incomplete) {
        setPhase("error");
        setCameraError(
          `The ${incomplete.step.toLowerCase()} capture did not record correctly. Please try again.`
        );
        return;
      }

      const oversized = captures.find((c) => (c.segment?.blob.size ?? 0) > MAX_VIDEO_UPLOAD_BYTES);
      if (oversized) {
        setPhase("error");
        setCameraError("A recorded clip is too large to upload. Please try again.");
        return;
      }

      dispatch({ type: "UPLOAD_START" });
      setUploadIndex(1);

      const urlsRes = await scanApi.uploadUrls(sid, {
        captures: captures.map((c) => ({
          step: c.step,
          video: {
            mimeType: c.segment!.mimeType,
            byteSize: c.segment!.blob.size,
            extension: c.segment!.extension,
          },
          frame: { mimeType: "image/jpeg", byteSize: c.frame!.blob.size, extension: "jpg" },
        })),
      });

      if (!urlsRes.success) throw new Error(`uploadUrls failed: ${urlsRes.error.message}`);
      pushLog(`Got presigned URLs`);

      setUploadIndex(2);

      const bundle: CaptureUpload[] = captures.map((c) => {
        const slot = urlsRes.data.captures.find((s) => s.step === c.step);
        if (!slot) throw new Error(`No upload slot returned for ${c.step}.`);
        return {
          step: c.step,
          video: { blob: c.segment!.blob, presign: slot.video },
          frame: { blob: c.frame!.blob, presign: slot.frame },
        };
      });

      pushLog(`Uploading ${bundle.length} captures to S3...`);
      await uploadCaptures(bundle, sid);
      pushLog(`S3 uploads complete`);

      setUploadIndex(3);
      dispatch({ type: "ANALYZE_START" });

      const durationMs = scanStartRef.current
        ? Math.round(performance.now() - scanStartRef.current)
        : 0;

      const completeRes = await scanApi.complete(sid, {
        durationMs,
        analysisStep: "CENTER",
        captures: bundle.map((b) => {
          const source = captures.find((c) => c.step === b.step)!;
          return {
            step: b.step,
            video: {
              objectKey: b.video.presign.objectKey,
              mimeType: source.segment!.mimeType,
              byteSize: source.segment!.blob.size,
              durationMs: source.segment!.durationMs,
            },
            frame: {
              objectKey: b.frame.presign.objectKey,
              mimeType: "image/jpeg",
              byteSize: source.frame!.blob.size,
              width: source.frame!.width,
              height: source.frame!.height,
            },
          };
        }),
        steps: stateRef.current.steps.map((s) => ({
          step: s.step,
          stepOrder: s.stepOrder,
          passed: s.passed,
          holdMs: s.holdMs,
          yaw: s.representativeYaw,
          pitch: s.representativePitch,
          roll: s.representativeRoll,
          frameTimestampMs: Math.max(0, Math.round(s.frameTimestampMs)),
        })),
        qualitySummary: {
          minimumFaceCount: stateRef.current.qualitySummary.minimumFaceCount,
          maximumFaceCount: stateRef.current.qualitySummary.maximumFaceCount,
          averageBrightness: clamp01(stateRef.current.qualitySummary.averageBrightness),
          bestSharpness: clamp01(stateRef.current.qualitySummary.bestSharpness),
        },
      });

      if (!completeRes.success) throw new Error(`complete failed: ${completeRes.error.message}`);
      pushLog(`Analysis complete`);

      setUploadIndex(4);
      dispatch({ type: "COMPLETE" });
      setPhase("done");
      if (!resultSentRef.current) {
        resultSentRef.current = true;
        onResult?.({ ageRange: completeRes.data.ageRange, sessionId: sid });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(err);
      pushLog(`UPLOAD ERROR: ${errMsg}`);
      setUploadFailed(true);
      setPhase("error");
      setCameraError(`Upload failed: ${errMsg}`);
    }
  }, [onResult, pushLog]);

  /** Fires once every direction has both its segment and its still. */
  const maybeStartUpload = useCallback(() => {
    if (uploadStartedRef.current) return;
    if (stateRef.current.step !== "RECORDING_COMPLETE") return;
    const ready = CHALLENGE_SEQUENCE.every(
      (step) => segmentsRef.current[step] && framesRef.current[step]
    );
    if (!ready) return;
    uploadStartedRef.current = true;
    void runUpload();
  }, [runUpload]);

  // -------------------------------------------------------------------------
  // Per-direction recording: start on pose lock, stop when the hold completes.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (phase !== "active") return;
    const step = state.currentStep;
    if (!step || !state.armed) return;
    if (activeRecorderRef.current) return;

    const activeStream = streamRef.current;
    if (!activeStream) return;

    try {
      const rec = startSegmentRecorder(activeStream);
      activeRecorderRef.current = { step, rec };
      queueMicrotask(() => setRecordingStep(step));

      // Move the session into `recording` once, before any upload URL is asked for.
      const sid = mediaSessionIdRef.current;
      if (sid && !recordingAnnouncedRef.current) {
        recordingAnnouncedRef.current = true;
        void scanApi.recordingStarted(sid).catch(() => {
          recordingAnnouncedRef.current = false;
        });
      }
    } catch (err) {
      console.error(err);
      setTimeout(() => {
        setCameraError("Recording is not supported in this browser.");
        setPhase("error");
      }, 0);
    }
  }, [phase, state.armed, state.currentStep]);

  useEffect(() => {
    const active = activeRecorderRef.current;
    if (!active) return;
    // The direction this recorder belongs to has passed its hold.
    if (!state.steps.some((s) => s.step === active.step)) return;

    activeRecorderRef.current = null;
    queueMicrotask(() => setRecordingStep(null));

    void active.rec
      .stop()
      .then(async (session) => {
        segmentsRef.current[active.step] = session;
        setCapturedSteps((prev) => (prev.includes(active.step) ? prev : [...prev, active.step]));
        setFlashStep(active.step);
        // This direction is done, so if the hold never yielded a usable still,
        // take one now — otherwise the upload gate blocks on it forever.
        if (!framesRef.current[active.step]) {
          await captureFallbackFrame(active.step);
          pushLog(
            framesRef.current[active.step]
              ? `${active.step} clip saved, still recovered`
              : `${active.step} clip saved, STILL MISSING`
          );
        } else {
          pushLog(`${active.step} clip + still saved`);
        }
        maybeStartUpload();
      })
      .catch((err) => {
        console.error(err);
        setCameraError(`The ${active.step.toLowerCase()} clip could not be saved. Please try again.`);
        setPhase("error");
      });
  }, [state.steps, maybeStartUpload, captureFallbackFrame, pushLog]);

  // The last segment may resolve before the machine reaches RECORDING_COMPLETE.
  useEffect(() => {
    if (state.step === "RECORDING_COMPLETE") maybeStartUpload();
  }, [state.step, maybeStartUpload]);

  // Safety net. Every clip is in but the upload gate has not opened, so a still
  // is missing and the fallback capture did not cover it. Retry once, then say
  // exactly what is wrong — the recording watchdog would otherwise fire minutes
  // later blaming the scan for taking too long, which is not what happened.
  useEffect(() => {
    if (state.step !== "RECORDING_COMPLETE") return;
    if (uploadStartedRef.current) return;

    const id = setTimeout(async () => {
      if (uploadStartedRef.current) return;

      for (const step of CHALLENGE_SEQUENCE) {
        if (!framesRef.current[step]) await captureFallbackFrame(step);
      }
      maybeStartUpload();
      if (uploadStartedRef.current) return;

      const missing = CHALLENGE_SEQUENCE.filter((step) => !framesRef.current[step]);
      pushLog(`No still frame for: ${missing.join(", ")}`);
      setCameraError(
        "The scan could not save a clear photo for every direction. Please try again in better light."
      );
      setPhase("error");
    }, FRAME_RECOVERY_GRACE_MS);

    return () => clearTimeout(id);
  }, [state.step, maybeStartUpload, captureFallbackFrame, pushLog]);

  // Brief "captured" flash on the step rail.
  useEffect(() => {
    if (!flashStep) return;
    const id = setTimeout(() => setFlashStep(null), 900);
    return () => clearTimeout(id);
  }, [flashStep]);

  // Timeout watchdog.
  useEffect(() => {
    if (phase !== "active") return;
    const id = setTimeout(() => {
      // Record what was actually outstanding. "Took too long" is true of the
      // clock and nothing else; without this the log cannot distinguish a user
      // who never finished the turns from a scan that finished and then stalled.
      const missingClips = CHALLENGE_SEQUENCE.filter((s) => !segmentsRef.current[s]);
      const missingStills = CHALLENGE_SEQUENCE.filter((s) => !framesRef.current[s]);
      pushLog(
        `TIMEOUT after ${MAX_RECORDING_DURATION_MS / 1000}s — machine=${stateRef.current.step}` +
          `, missing clips=[${missingClips.join(",") || "none"}]` +
          `, missing stills=[${missingStills.join(",") || "none"}]`
      );

      dispatch({ type: "TIMEOUT" });
      setPhase("error");
      setCameraError("The scan took too long. Please try again.");
    }, MAX_RECORDING_DURATION_MS);
    return () => clearTimeout(id);
  }, [phase, pushLog]);

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------
  const cancel = useCallback(() => {
    dispatch({ type: "CANCEL" });
    activeRecorderRef.current?.rec.abort();
    activeRecorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setStream(null);
    onExit?.();
  }, [onExit]);

  useEffect(() => {
    const id = setTimeout(() => void startCamera(), 0);
    return () => {
      clearTimeout(id);
      activeRecorderRef.current?.rec.abort();
      activeRecorderRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [startCamera]);

  const tone: MeshTone = useMemo(() => {
    if (recordingStep) return "ready";
    if (qualityMessage && qualityMessage !== "ok") return "warning";
    return "scanning";
  }, [recordingStep, qualityMessage]);

  const holdRatio = Math.min(1, state.holdProgressMs / SCAN_CONFIG.requiredHoldMs);

  // -------------------------------------------------------------------------
  // Render — a single full-viewport surface for every phase.
  // -------------------------------------------------------------------------
  if (phase === "error") {
    return (
      <ScanShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#9e3d3d]">Scan aborted</p>
          <p className="max-w-sm text-lg text-[#3c2718]">{cameraError ?? "Something went wrong."}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              onClick={() => {
                // A session that failed mid-flight has already moved past
                // `recording`, so it can never accept uploads again. Drop it and
                // let the consent gate mint a fresh one, rather than reloading
                // into the same dead id and 409-ing forever.
                clearActiveSession();
                window.location.reload();
              }}
              className="h-12 rounded-full bg-[#351d0f] px-8 font-semibold text-white hover:bg-[#4b2a16]"
            >
              Try again
            </Button>
            {onExit && (
              <Button
                variant="ghost"
                onClick={onExit}
                className="h-12 rounded-full px-8 text-[#755d4a] hover:bg-[#f7f0e8] hover:text-[#3c2718]"
              >
                Exit
              </Button>
            )}
          </div>
          {/* Debug log on error screen */}
          {debugLog.length > 0 && (
            <div className="mt-6 max-h-48 w-full max-w-sm overflow-y-auto rounded-lg border border-[#eadbca] bg-white p-3 text-left">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-[#a9703e]">Debug Log</p>
              {debugLog.map((line, i) => (
                <p key={i} className="font-mono text-[10px] leading-relaxed text-[#755d4a]">{line}</p>
              ))}
            </div>
          )}
        </div>
      </ScanShell>
    );
  }

  if (phase === "uploading" || phase === "done") {
    return (
      <ScanShell>
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="w-full max-w-md">
            <UploadProgress current={uploadIndex} failed={uploadFailed} />
          </div>
        </div>
      </ScanShell>
    );
  }

  return (
    <ScanShell>
      {/* Live camera + face structure */}
      <div className="absolute inset-0">
        <CameraPreview stream={stream} onVideoReady={handleVideoReady} />
        <div className="pointer-events-none absolute inset-0">
          <FaceMeshOverlay source={meshFrameRef} tone={tone} guideRef={guideRef} />
        </div>
        {/* Readability scrim behind the HUD */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#fcfaf7]/95 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-[#fcfaf7]/95 via-[#fcfaf7]/60 to-transparent" />
      </div>

      {/* Top HUD — a compact centred console. Full-width panels left the face
          almost no room on desktop, so the chrome is capped and the video keeps
          the rest of the viewport. */}
      <div className="relative z-10 mx-auto w-full max-w-2xl px-4 sm:px-5">
        <header className="mt-[max(0.75rem,env(safe-area-inset-top))] flex items-center justify-between gap-3 rounded-2xl border border-[#eadbca] bg-white/95 px-4 py-2.5 shadow-sm backdrop-blur">
          <div className="min-w-0">
            <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-[#a9703e]">
              Find your skin age
            </p>
            <p className="mt-0.5 truncate text-sm font-medium text-[#755d4a]">
              {phase === "preparing" ? "Calibrating scanner" : "Scan in progress"}
            </p>
          </div>
          <button
            type="button"
            onClick={cancel}
            aria-label="Exit scan"
            className="shrink-0 rounded-full border border-[#decbb8] bg-white p-2 text-[#755d4a] transition hover:bg-[#fff7ed] hover:text-[#3c2718]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="mt-2.5">
          <ScanProgress
            currentIndex={state.stepIndex}
            capturedSteps={capturedSteps}
            recordingStep={recordingStep}
            flashStep={flashStep}
            holdRatio={holdRatio}
          />
        </div>
      </div>

      {SCAN_DEBUG && eyewearDebug && (
        <div className="pointer-events-none absolute bottom-40 left-4 z-30 rounded-lg bg-[#2a1710]/85 px-3 py-2 font-mono text-[10px] leading-relaxed text-[#f3e2cd]">
          eyewear: {eyewearDebug}
        </div>
      )}

      {/* Side cue on tablet and up; the phone version sits above the panel. */}
      {phase === "active" && countdown === null && (
        <TurnCue step={state.currentStep} placement="edge" />
      )}

      {/* Countdown takeover */}
      {countdown !== null && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#fcfaf7]/75 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.35em] text-[#a9703e]">
              Get ready
            </span>
            <span className="font-serif text-8xl font-semibold tabular-nums text-[#3c2718] drop-shadow-[0_8px_16px_rgba(185,130,78,0.25)]">
              {Math.ceil(countdown)}
            </span>
          </div>
        </div>
      )}

      {/* Bottom instruction panel */}
      <footer className="relative z-10 mx-auto mt-auto w-full max-w-2xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5">
        {phase === "preparing" && stalled && countdown === null && (
          <div className="mb-3 flex justify-center">
            <Button
              onClick={startAnyway}
              className="h-11 rounded-full bg-[#351d0f] px-6 text-sm font-semibold text-white hover:bg-[#4b2a16]"
            >
              Start scan anyway
            </Button>
          </div>
        )}
        {phase === "active" && countdown === null && (
          <TurnCue step={state.currentStep} placement="inline" />
        )}

        <DirectionInstruction
          step={state.currentStep}
          qualityMessage={qualityMessage ?? undefined}
          recording={recordingStep !== null}
          holdRatio={holdRatio}
          preparing={phase === "preparing"}
        />
        {landmarkerError && (
          <p className="mt-3 text-center text-sm text-[#9e3d3d]">{landmarkerError}</p>
        )}
      </footer>

      {/* Low camera quality warning banner */}
      {cameraWarning && (
        <div className="absolute inset-x-0 top-[max(8rem,env(safe-area-inset-top,8rem))] z-30 mx-auto w-full max-w-2xl animate-in fade-in slide-in-from-top-2 px-4 duration-300 sm:px-5">
          <div className="relative flex items-start gap-2.5 rounded-xl border border-[#eedcc4] bg-[#fdf7ee]/95 px-4 py-3 shadow-[0_10px_24px_rgba(72,43,24,0.10)] backdrop-blur-md">
            <span className="mt-0.5 text-lg">⚠️</span>
            <p className="flex-1 text-sm leading-snug text-[#87572f]">{cameraWarning}</p>
            <button
              type="button"
              onClick={() => setCameraWarning(null)}
              className="shrink-0 rounded-full p-1 text-[#a9703e] transition hover:bg-[#f3e7da] hover:text-[#3c2718]"
              aria-label="Dismiss camera warning"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </ScanShell>
  );
}

/** Full-viewport surface shared by every scanner phase. */
function ScanShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#fcfaf7] text-[#3c2718]">
      <div className="scan-grid-warm pointer-events-none absolute inset-0" aria-hidden="true" />
      {children}
    </div>
  );
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
