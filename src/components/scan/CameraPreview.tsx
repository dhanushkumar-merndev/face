"use client";

import { useRef, useEffect } from "react";

/**
 * Mirrored live camera preview. The video element is CSS-mirrored
 * (scale-x-[-1]) so it feels natural to the user.
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

    video.srcObject = stream;
    video.play().catch(() => {});

    const notifyReady = () => {
      if (video.readyState >= 1) {
        onVideoReady?.(video);
      }
    };

    notifyReady();

    const onLoadedMetadata = () => notifyReady();
    const onCanPlay = () => notifyReady();

    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("canplay", onCanPlay);

    return () => {
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("canplay", onCanPlay);
    };
  }, [stream, onVideoReady]);

  return (
    <video
      ref={(el) => {
        videoRef.current = el;
        if (el && el.readyState >= 1) {
          onVideoReady?.(el);
        }
      }}
      className="h-full w-full -scale-x-100 object-cover"
      playsInline
      muted
      autoPlay
    />
  );
}

