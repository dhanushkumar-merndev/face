"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChallengeStep } from "@/lib/face/types";

/**
 * Large directional cue for the two turn steps. The instruction panel says it
 * in words; this says it in motion, out at the edge of the frame the user is
 * being asked to turn towards.
 *
 * `edge` rides the left or right side of the viewport on tablet and desktop,
 * stacked. `inline` is a compact horizontal pill that sits above the
 * instruction card on phones, where vertical space is scarce. Both are
 * decorative — the panel already announces the step to screen readers.
 */
const CHEVRONS = [0, 1, 2];
const STAGGER_MS = 140;

export function TurnCue({
  step,
  placement,
}: {
  step: ChallengeStep | null;
  placement: "edge" | "inline";
}) {
  if (step !== "LEFT" && step !== "RIGHT") return null;

  const left = step === "LEFT";
  const edge = placement === "edge";
  const Arrow = left ? ArrowLeft : ArrowRight;

  const chevrons = (
    <div className={cn("flex items-center gap-0.5 text-[#e9c79e]", !left && "flex-row-reverse")}>
      {CHEVRONS.map((i) => (
        <svg
          key={i}
          viewBox="0 0 20 20"
          className={cn(edge ? "h-7 w-7" : "h-4 w-4", left ? "animate-cue-left" : "animate-cue-right")}
          // The wave travels outward, so the chevron nearest the face leads.
          style={{ animationDelay: `${(CHEVRONS.length - 1 - i) * STAGGER_MS}ms` }}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={left ? "M13 4 7 10l6 6" : "M7 4l6 6-6 6"} />
        </svg>
      ))}
    </div>
  );

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none",
        edge
          ? cn(
              "absolute top-1/2 z-10 hidden -translate-y-1/2 sm:block",
              left ? "left-4 md:left-10" : "right-4 md:right-10"
            )
          : "mb-3 flex justify-center sm:hidden"
      )}
    >
      {/* Dark surface deliberately: a white card vanished against a bright room,
          which is the lighting the scan asks people to stand in. */}
      <div
        className={cn(
          "flex items-center border border-white/10 bg-[#2a1710]/88 shadow-[0_20px_50px_rgba(28,14,6,0.45)] backdrop-blur-md",
          edge ? "flex-col gap-3.5 rounded-3xl px-6 py-6" : "gap-3 rounded-full px-4 py-2.5"
        )}
      >
        <span
          className={cn(
            "grid shrink-0 place-items-center rounded-full bg-[#e9c79e] text-[#2a1710] shadow-[0_6px_18px_rgba(0,0,0,0.35)]",
            edge ? "h-16 w-16" : "h-10 w-10",
            left ? "animate-cue-nudge-left" : "animate-cue-nudge-right"
          )}
        >
          <Arrow className={edge ? "h-8 w-8" : "h-5 w-5"} strokeWidth={2.75} />
        </span>

        {chevrons}

        {edge && (
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#f3e2cd]">
            Turn {left ? "left" : "right"}
          </span>
        )}
      </div>
    </div>
  );
}
