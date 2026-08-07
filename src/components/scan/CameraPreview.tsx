"use client";

import { useRef, useEffect } from "react";

/**
 * Mirrored live camera preview. Uses stable ref binding to avoid
 * re-render loops and video flickering on mobile.
 */
export function CameraPreview({
  stream,
  onVideoReady,
}: {
  stream: MediaStream | null;
  onVideoReady?: (video: HTMLVideoElement) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    if (video.srcObject !== stream) {
      video.srcObject = stream;
      video.play().catch(() => {});
    }

    const checkReady = () => {
      if (video.readyState >= 2) {
        onVideoReady?.(video);
      }
    };

    checkReady();

    video.addEventListener("loadedmetadata", checkReady);
    video.addEventListener("canplay", checkReady);

    return () => {
      video.removeEventListener("loadedmetadata", checkReady);
      video.removeEventListener("canplay", checkReady);
    };
  }, [stream, onVideoReady]);

  return (
    <video
      ref={videoRef}
      className="h-full w-full -scale-x-100 bg-[#f5e8db] object-cover"
      playsInline
      muted
      autoPlay
    />
  );
}
