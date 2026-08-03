"use client";

import { cn } from "@/lib/utils";

/**
 * Oval face guide overlay rendered on top of the mirrored video preview.
 * Uses currentColor so the parent can tint it green (ready) or red (error).
 */
export function FaceGuideOverlay({
  className,
  state = "neutral",
}: {
  className?: string;
  state?: "neutral" | "ready" | "error";
}) {
  return (
    <div className={cn("pointer-events-none absolute inset-0", className)}>
      <svg
        viewBox="0 0 200 260"
        className={cn(
          "absolute left-1/2 top-1/2 h-[62%] w-auto -translate-x-1/2 -translate-y-1/2",
          state === "ready" && "text-emerald-400",
          state === "error" && "text-red-400",
          state === "neutral" && "text-white/70"
        )}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        aria-hidden="true"
      >
        <ellipse cx="100" cy="130" rx="72" ry="100" />
      </svg>
    </div>
  );
}
