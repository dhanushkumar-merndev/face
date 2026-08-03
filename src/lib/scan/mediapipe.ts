"use client";

import { useCallback, useEffect, useState } from "react";
import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";

let landmarkerPromise: Promise<FaceLandmarker> | null = null;

/**
 * Lazily initializes Face Landmarker once per page load (browser only).
 * MediaPipe is dynamically imported so the scanner page loads it on demand.
 */
async function loadFaceLandmarker(): Promise<FaceLandmarker> {
  if (landmarkerPromise) return landmarkerPromise;

  landmarkerPromise = (async () => {
    const vision = await FilesetResolver.forVisionTasks(
      "/mediapipe/wasm"
    );

    return FaceLandmarker.createFromOptions(vision, {
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
  })();

  return landmarkerPromise;
}

export function useFaceLandmarker() {
  const [landmarker, setLandmarker] = useState<FaceLandmarker | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const init = useCallback(async () => {
    if (landmarker || loading) return;
    setLoading(true);
    setError(null);
    try {
      const loaded = await loadFaceLandmarker();
      setLandmarker(loaded);
    } catch (err) {
      console.error("FaceLandmarker init failed", err);
      setError(
        "The face model could not be loaded. Check that public/models/face_landmarker.task exists (run pnpm copy:mediapipe)."
      );
    } finally {
      setLoading(false);
    }
  }, [landmarker, loading]);

  useEffect(() => {
    const id = setTimeout(() => void init(), 0);
    return () => clearTimeout(id);
  }, [init]);

  return { landmarker, error, loading };
}
