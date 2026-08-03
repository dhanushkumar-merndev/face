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
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onLoaded = () => onVideoReady?.(video);
    video.addEventListener("loadedmetadata", onLoaded);
    return () => video.removeEventListener("loadedmetadata", onLoaded);
  }, [onVideoReady]);

  return (
    <video
      ref={videoRef}
      className="h-full w-full -scale-x-100 object-cover"
      playsInline
      muted
      autoPlay
    />
  );
}
