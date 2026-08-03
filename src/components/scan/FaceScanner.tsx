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
import type { MeshTone } from "@/lib/face/mesh";
import { startSegmentRecorder, type SegmentRecorder, type RecordingSession } from "@/lib/scan/media-recorder";
import { loadImageFromVideo, cropFaceCanvas, canvasToJpeg } from "@/lib/scan/best-frame";
import { scanApi } from "@/lib/scan/api";
import { uploadCaptures, type CaptureUpload } from "@/lib/scan/upload";
import { CameraPreview } from "./CameraPreview";
import { FaceMeshOverlay, type MeshFrame } from "./FaceMeshOverlay";
import { DirectionInstruction } from "./DirectionInstruction";
import { ScanProgress } from "./ScanProgress";
import { UploadProgress } from "./UploadProgress";
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
      // MediaPipe may throw on the very first frame or log INFO messages
      // (e.g. "Created TensorFlow Lite XNNPACK delegate for CPU") that
      // Next.js dev mode surfaces as errors. Safe to skip this frame.
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
    meshFrameRef.current =
      faceCount >= 1
        ? {
            landmarks: faces[0].map((p) => ({ x: p.x, y: p.y })),
            videoWidth: frameWidth,
            videoHeight: frameHeight,
          }
        : null;

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

      const targetW = 160;
      const targetH = Math.round((frameHeight / frameWidth) * targetW);
      if (!analysisCanvasRef.current) {
        analysisCanvasRef.current = document.createElement("canvas");
      }
      const analysis = analysisCanvasRef.current;
      if (analysis.width !== targetW) analysis.width = targetW;
      if (analysis.height !== targetH) analysis.height = targetH;
      const ctx = analysis.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(video, 0, 0, targetW, targetH);
        luminance = computeLuminance(ctx, targetW, targetH);
        sharpness = computeSharpness(ctx, targetW, targetH);
      }

      const area = frameWidth * frameHeight;
      const ratio = (box.width * box.height) / area;
      if (ratio < SCAN_CONFIG.faceAreaMinRatio) qualityMessage = "move_closer";
      else if (ratio > SCAN_CONFIG.faceAreaMaxRatio) qualityMessage = "move_farther";
      else if (
        Math.abs(box.x + box.width / 2 - frameWidth / 2) / frameWidth > SCAN_CONFIG.maxCenterOffsetRatio ||
        Math.abs(box.y + box.height / 2 - frameHeight / 2) / frameHeight > SCAN_CONFIG.maxCenterOffsetRatio
      ) {
        qualityMessage = "center_face";
      } else if (luminance !== undefined && (luminance < 0.2 || luminance > 0.85)) {
        qualityMessage = "improve_lighting";
      } else if (sharpness !== undefined && sharpness < 0.02) {
        qualityMessage = "hold_steady";
      } else {
        // Glasses / obstruction detection via face blendshapes.
        // When glasses are present, eyeSquint values are elevated while
        // eyeBlink values stay low (lenses prevent the eyelid from closing
        // naturally). We also check for specular glare hotspots in the
        // eye-bridge region of the frame.
        const blendshapes = result.faceBlendshapes?.[0]?.categories;
        if (blendshapes) {
          const get = (name: string) =>
            blendshapes.find((b: { categoryName: string }) => b.categoryName === name)?.score ?? 0;

          const squintL = get("eyeSquintLeft");
          const squintR = get("eyeSquintRight");
          const blinkL = get("eyeBlinkLeft");
          const blinkR = get("eyeBlinkRight");

          // Glasses cause persistent squinting with low blink — natural squinting
          // also raises the blink score, so the gap is diagnostic.
          const avgSquint = (squintL + squintR) / 2;
          const avgBlink = (blinkL + blinkR) / 2;
          const glassesLikely = avgSquint > 0.35 && avgBlink < 0.15;

          // Eye-bridge glare check: sample the nose-bridge region for
          // specular highlights that indicate reflective surfaces (glasses).
          let glareDetected = false;
          if (ctx && lm0.length > 168) {
            // MediaPipe landmark 6 = nose bridge between eyes
            const bridge = lm0[6];
            const sampleX = Math.round(bridge.x * targetW);
            const sampleY = Math.round(bridge.y * targetH);
            const radius = 4;
            const sx = Math.max(0, sampleX - radius);
            const sy = Math.max(0, sampleY - radius);
            const sw = Math.min(radius * 2, targetW - sx);
            const sh = Math.min(radius * 2, targetH - sy);
            if (sw > 0 && sh > 0) {
              const patch = ctx.getImageData(sx, sy, sw, sh);
              let hotPixels = 0;
              for (let i = 0; i < patch.data.length; i += 4) {
                const maxC = Math.max(patch.data[i], patch.data[i + 1], patch.data[i + 2]);
                if (maxC > 240) hotPixels++;
              }
              const hotRatio = hotPixels / (patch.data.length / 4);
              if (hotRatio > 0.35) glareDetected = true;
            }
          }

          if (glassesLikely || glareDetected) {
            qualityMessage = "obstruction_detected";
          }
        }
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
  }, [landmarker, phase, captureFrameFor]);

  // -------------------------------------------------------------------------
  // Inference loop — starts when camera + model are ready.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (phase !== "preparing" && phase !== "active") return;
    if (!landmarker || !videoRef.current) return;

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
  }, [phase, landmarker, runInference]);

  const countdownStartedRef = useRef(false);

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
      .then((session) => {
        segmentsRef.current[active.step] = session;
        setCapturedSteps((prev) => (prev.includes(active.step) ? prev : [...prev, active.step]));
        setFlashStep(active.step);
        maybeStartUpload();
      })
      .catch((err) => {
        console.error(err);
        setCameraError(`The ${active.step.toLowerCase()} clip could not be saved. Please try again.`);
        setPhase("error");
      });
  }, [state.steps, maybeStartUpload]);

  // The last segment may resolve before the machine reaches RECORDING_COMPLETE.
  useEffect(() => {
    if (state.step === "RECORDING_COMPLETE") maybeStartUpload();
  }, [state.step, maybeStartUpload]);

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
      dispatch({ type: "TIMEOUT" });
      setPhase("error");
      setCameraError("The scan took too long. Please try again.");
    }, MAX_RECORDING_DURATION_MS);
    return () => clearTimeout(id);
  }, [phase]);

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
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-rose-400">Scan aborted</p>
          <p className="max-w-sm text-lg text-white/90">{cameraError ?? "Something went wrong."}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              onClick={() => window.location.reload()}
              className="h-12 rounded-full bg-cyan-400 px-8 font-semibold text-slate-950 hover:bg-cyan-300"
            >
              Try again
            </Button>
            {onExit && (
              <Button
                variant="ghost"
                onClick={onExit}
                className="h-12 rounded-full px-8 text-white/70 hover:bg-white/10 hover:text-white"
              >
                Exit
              </Button>
            )}
          </div>
          {/* Debug log on error screen */}
          {debugLog.length > 0 && (
            <div className="mt-6 max-h-48 w-full max-w-sm overflow-y-auto rounded-lg border border-white/10 bg-black/60 p-3 text-left">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-cyan-400/60">Debug Log</p>
              {debugLog.map((line, i) => (
                <p key={i} className="font-mono text-[10px] leading-relaxed text-white/50">{line}</p>
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
        <CameraPreview
          stream={stream}
          onVideoReady={(video) => {
            videoRef.current = video;
          }}
        />
        <div className="pointer-events-none absolute inset-0">
          <FaceMeshOverlay source={meshFrameRef} tone={tone} />
        </div>
        {/* Readability scrim behind the HUD */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-slate-950/90 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-slate-950/95 via-slate-950/70 to-transparent" />
      </div>

      {/* Top HUD */}
      <header className="relative z-10 flex items-start justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-cyan-300/80">
            Find your skin age
          </p>
          <p className="mt-1 text-sm font-medium text-white/70">
            {phase === "preparing" ? "Calibrating scanner" : "Scan in progress"}
          </p>
        </div>
        <button
          type="button"
          onClick={cancel}
          aria-label="Exit scan"
          className="rounded-full border border-white/15 bg-white/5 p-2.5 text-white/80 backdrop-blur transition hover:bg-white/15 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="relative z-10 mt-5 px-5">
        <ScanProgress
          currentIndex={state.stepIndex}
          capturedSteps={capturedSteps}
          recordingStep={recordingStep}
          flashStep={flashStep}
          holdRatio={holdRatio}
        />
      </div>

      {/* Countdown takeover */}
      {countdown !== null && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.35em] text-cyan-300">
              Get ready
            </span>
            <span className="text-8xl font-bold tabular-nums text-white drop-shadow-[0_0_25px_rgba(56,189,248,0.6)]">
              {Math.ceil(countdown)}
            </span>
          </div>
        </div>
      )}

      {/* Bottom instruction panel */}
      <footer className="relative z-10 mt-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <DirectionInstruction
          step={state.currentStep}
          qualityMessage={qualityMessage ?? undefined}
          recording={recordingStep !== null}
          holdRatio={holdRatio}
          preparing={phase === "preparing"}
        />
        {landmarkerError && (
          <p className="mt-3 text-center text-sm text-rose-400">{landmarkerError}</p>
        )}
      </footer>

      {/* Low camera quality warning banner */}
      {cameraWarning && (
        <div className="absolute inset-x-0 top-[max(3.5rem,env(safe-area-inset-top,3.5rem))] z-30 mx-4 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="relative flex items-start gap-2.5 rounded-xl border border-amber-400/30 bg-amber-950/80 px-4 py-3 backdrop-blur-md">
            <span className="mt-0.5 text-lg">⚠️</span>
            <p className="flex-1 text-sm leading-snug text-amber-200">{cameraWarning}</p>
            <button
              type="button"
              onClick={() => setCameraWarning(null)}
              className="shrink-0 rounded-full p-1 text-amber-300/70 transition hover:bg-amber-300/20 hover:text-amber-200"
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

/** Full-viewport dark surface shared by every scanner phase. */
function ScanShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-slate-950 text-white">
      <div className="scan-grid pointer-events-none absolute inset-0 opacity-[0.18]" aria-hidden="true" />
      {children}
    </div>
  );
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
