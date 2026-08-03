"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { FaceLandmarker } from "@mediapipe/tasks-vision";
import {
  SCAN_CONFIG,
  TARGET_INFERENCE_INTERVAL_MS,
  MAX_RECORDING_DURATION_MS,
  MAX_VIDEO_UPLOAD_BYTES,
} from "@/lib/face/config";
import type { FaceInfo, QualityMessage } from "@/lib/face/types";
import { matrixToHeadPose } from "@/lib/face/pose";
import { reducer, initialState } from "@/lib/face/challenge-reducer";
import { computeSharpness, computeLuminance } from "@/lib/face/canvas-quality";
import { createRecorder, startRecording, stopRecording, type RecordingSession } from "@/lib/scan/media-recorder";
import { loadImageFromVideo, cropFaceCanvas, canvasToJpeg, makeThumbnail } from "@/lib/scan/best-frame";
import { scanApi } from "@/lib/scan/api";
import { uploadAll } from "@/lib/scan/upload";
import { CameraPreview } from "./CameraPreview";
import { FaceGuideOverlay } from "./FaceGuideOverlay";
import { DirectionInstruction } from "./DirectionInstruction";
import { ScanProgress } from "./ScanProgress";
import { QualityMessage as QualityMessageView } from "./QualityMessage";
import { UploadProgress } from "./UploadProgress";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type ScanPhase = "preparing" | "active" | "uploading" | "done" | "error";

export function FaceScanner({
  sessionId,
  onResult,
}: {
  sessionId?: string;
  onResult?: (result: { ageRange: { low: number; high: number } | null; sessionId: string }) => void;
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

  const [state, dispatch] = useReducer(reducer, undefined, () => initialState);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const bestFrameRef = useRef<{ blob: Blob; width: number; height: number } | null>(null);
  const thumbnailRef = useRef<Blob | null>(null);
  const lastInferenceRef = useRef(0);
  const rafRef = useRef(0);
  const scanStartRef = useRef<number | null>(null);
  const mediaSessionIdRef = useRef(sessionId);
  const resultSentRef = useRef(false);

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
        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks("/mediapipe/wasm");
        const lm = await vision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: "/models/face_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numFaces: 2,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
          minFaceDetectionConfidence: 0.7,
          minFacePresenceConfidence: 0.7,
          minTrackingConfidence: 0.7,
        });
        if (!cancelled) setLandmarker(lm);
      } catch (err) {
        console.error(err);
        if (!cancelled) setLandmarkerError("Face model failed to load.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
  }, []);

  // -------------------------------------------------------------------------
  // runInference — defined before the loop that uses it.
  // -------------------------------------------------------------------------
  const runInference = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const lm = landmarker;
    if (!lm) return;

    const result = lm.detectForVideo(video, performance.now());
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

      const analysis = document.createElement("canvas");
      const targetW = 160;
      const targetH = Math.round((frameHeight / frameWidth) * targetW);
      analysis.width = targetW;
      analysis.height = targetH;
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
      }
    }

    const qualityOk = qualityMessage === "ok";
    setQualityMessage(qualityMessage);
    if (qualityOk && face && phase === "preparing") {
      setFaceCentered(true);
    }

    const currentStep = stateRef.current.step;

    // Best-frame capture during CENTER_FINAL from the ORIGINAL video frame.
    if (currentStep === "CENTER_FINAL" && face) {
      const originalCanvas = loadImageFromVideo(video);
      const cropped = cropFaceCanvas(originalCanvas, face.box);
      const [jpegBlob, thumbBlob] = [canvasToJpeg(cropped), canvasToJpeg(makeThumbnail(cropped))];
      Promise.all([jpegBlob, thumbBlob]).then(([jpeg, thumb]) => {
        if (!bestFrameRef.current || jpeg.size > bestFrameRef.current.blob.size) {
          bestFrameRef.current = {
            blob: jpeg,
            width: cropped.width,
            height: cropped.height,
          };
          thumbnailRef.current = thumb;
        }
      });
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
  }, [landmarker, phase]);

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

  // -------------------------------------------------------------------------
  // Countdown when camera + model ready and face is centered.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (phase === "preparing" && stream && landmarker && faceCentered && countdown === null) {
      let remaining = SCAN_CONFIG.countdownMs / 1000;
      const t = setTimeout(() => setCountdown(remaining), 0);
      const id = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          clearInterval(id);
          setCountdown(null);
          scanStartRef.current = Date.now();
          dispatch({ type: "COUNTDOWN_FINISHED" });
          setPhase("active");
        } else {
          setCountdown(remaining);
        }
      }, 1000);
      return () => {
        clearTimeout(t);
        clearInterval(id);
      };
    }
  }, [phase, stream, landmarker, faceCentered, countdown]);

  // -------------------------------------------------------------------------
  // Upload + analysis — defined before the recording effect that uses it.
  // -------------------------------------------------------------------------
  const handleUpload = useCallback(
    async (session: RecordingSession) => {
      const sid = mediaSessionIdRef.current;
      if (!sid) {
        setPhase("error");
        setCameraError("Scan session was not created.");
        return;
      }
      const blob = session.blob;
      if (blob.size > MAX_VIDEO_UPLOAD_BYTES) {
        setPhase("error");
        setCameraError("The recording is too large to upload. Please try again.");
        return;
      }
      if (!bestFrameRef.current) {
        setPhase("error");
        setCameraError("No best frame was captured. Please try again.");
        return;
      }

      setPhase("uploading");
      setUploadIndex(0);
      setUploadFailed(false);

      try {
        dispatch({ type: "UPLOAD_START" });
        setUploadIndex(1);
        const urlsRes = await scanApi.uploadUrls(sid, {
          video: {
            mimeType: blob.type,
            byteSize: blob.size,
            extension: session.extension,
          },
          bestFrame: {
            mimeType: "image/jpeg",
            byteSize: bestFrameRef.current.blob.size,
            extension: "jpg",
          },
          thumbnail: null,
        });

        if (!urlsRes.success) {
          throw new Error(urlsRes.error.message);
        }

        setUploadIndex(2);
        await uploadAll({
          video: { blob, presign: urlsRes.data.video },
          bestFrame: { blob: bestFrameRef.current.blob, presign: urlsRes.data.bestFrame },
        });

        setUploadIndex(4);
        dispatch({ type: "ANALYZE_START" });

        const durationMs = scanStartRef.current ? Math.round(performance.now() - scanStartRef.current) : 0;

        const completeRes = await scanApi.complete(sid, {
          durationMs,
          video: {
            objectKey: urlsRes.data.video.objectKey,
            mimeType: blob.type,
            byteSize: blob.size,
          },
          bestFrame: {
            objectKey: urlsRes.data.bestFrame.objectKey,
            mimeType: "image/jpeg",
            byteSize: bestFrameRef.current.blob.size,
            width: bestFrameRef.current.width,
            height: bestFrameRef.current.height,
          },
          steps: stateRef.current.steps,
          qualitySummary: stateRef.current.qualitySummary,
        });

        if (!completeRes.success) {
          throw new Error(completeRes.error.message);
        }

        setUploadIndex(5);
        dispatch({ type: "COMPLETE" });
        setPhase("done");
        if (!resultSentRef.current) {
          resultSentRef.current = true;
          onResult?.({
            ageRange: completeRes.data.ageRange,
            sessionId: sid,
          });
        }
      } catch (err) {
        console.error(err);
        setUploadFailed(true);
        setPhase("error");
      }
    },
    [onResult]
  );

  // -------------------------------------------------------------------------
  // Recording: start at CENTER, stop at CENTER_FINAL completion.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (phase === "active" && state.step === "CENTER" && !recorderRef.current && streamRef.current) {
      try {
        const { recorder, chunks } = createRecorder(streamRef.current);
        recorderRef.current = recorder;
        chunksRef.current = chunks;
        startRecording(recorder);
        dispatch({ type: "RECORDING_STARTED" });
      } catch (err) {
        console.error(err);
        // Defer state updates out of the effect body.
        setTimeout(() => {
          setCameraError("Recording is not supported in this browser.");
          setPhase("error");
        }, 0);
      }
    }

    if (state.step === "RECORDING_COMPLETE" && recorderRef.current) {
      const rec = recorderRef.current;
      void stopRecording(rec)
        .then((session) => {
          if (session.blob.size === 0) {
            setPhase("error");
            setCameraError("The recording was empty. Please try again.");
            return;
          }
          void handleUpload(session);
        })
        .catch((err) => {
          console.error(err);
          setPhase("error");
        });
    }
  }, [phase, state.step, handleUpload]);

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
  // Handlers
  // -------------------------------------------------------------------------
  const cancel = useCallback(() => {
    dispatch({ type: "CANCEL" });
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setStream(null);
    setPhase("error");
  }, []);

  useEffect(() => {
    const id = setTimeout(() => void startCamera(), 0);
    return () => {
      clearTimeout(id);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [startCamera]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  if (phase === "error") {
    return (
      <Card className="w-full max-w-lg">
        <CardContent className="flex flex-col gap-4 p-6">
          <p className="font-medium text-red-600">{cameraError ?? "Something went wrong."}</p>
          <Button onClick={() => window.location.reload()}>Try again</Button>
        </CardContent>
      </Card>
    );
  }

  if (phase === "uploading") {
    return (
      <Card className="w-full max-w-lg">
        <CardContent className="flex flex-col gap-6 p-6">
          <UploadProgress current={uploadIndex} failed={uploadFailed} />
        </CardContent>
      </Card>
    );
  }

  if (phase === "done") {
    return (
      <Card className="w-full max-w-lg">
        <CardContent className="flex flex-col gap-4 p-6 text-center">
          <p className="text-xl font-semibold">Scan complete</p>
          <p className="text-muted-foreground">
            Your estimated age range has been saved. You can view the result on the next page.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-black">
        <CameraPreview
          stream={stream}
          onVideoReady={(video) => {
            videoRef.current = video;
          }}
        />
        <FaceGuideOverlay
          state={qualityMessage === "ok" ? "ready" : qualityMessage ? "error" : "neutral"}
        />
        {countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <span className="text-6xl font-bold text-white">{Math.ceil(countdown)}</span>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-3">
        <ScanProgress
          currentIndex={state.stepIndex}
          holdProgressMs={state.holdProgressMs}
          requiredHoldMs={SCAN_CONFIG.requiredHoldMs}
        />
        <DirectionInstruction step={state.currentStep} qualityMessage={qualityMessage ?? undefined} />
        <QualityMessageView message={qualityMessage} showOk />
        {phase === "preparing" && landmarkerError && (
          <p className="text-sm text-red-600">{landmarkerError}</p>
        )}
        {phase === "active" && (
          <Button variant="destructive" onClick={cancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
