"use client";

import { CHALLENGE_SEQUENCE, STEP_SHORT_LABEL } from "@/lib/face/config";
import type { ChallengeStep } from "@/lib/face/types";
import { cn } from "@/lib/utils";
import { Check, Circle, Video } from "lucide-react";

/**
 * Mission rail for the three capture directions. Each tile shows whether that
 * direction is pending, currently recording, or already captured.
 */
export function ScanProgress({
  currentIndex,
  capturedSteps,
  recordingStep,
  flashStep,
  holdRatio = 0,
}: {
  currentIndex: number;
  capturedSteps: ChallengeStep[];
  recordingStep: ChallengeStep | null;
  flashStep?: ChallengeStep | null;
  holdRatio?: number;
}) {
  return (
    <ol className="flex items-stretch gap-2" aria-label="Capture progress">
      {CHALLENGE_SEQUENCE.map((step, i) => {
        const captured = capturedSteps.includes(step);
        const recording = recordingStep === step;
        const active = i === currentIndex && !captured;
        const flashing = flashStep === step;

        return (
          <li key={step} className="flex-1">
            <div
              aria-current={active ? "step" : undefined}
              className={cn(
                "relative overflow-hidden rounded-xl border px-2.5 py-2 backdrop-blur transition-all duration-300",
                captured && "border-[#acc0ad] bg-[#eef5ee]",
                recording && "border-[#dcafb0] bg-[#fff1ef]",
                active && !recording && "border-[#e2c29d] bg-[#fff7ed]",
                !captured && !active && !recording && "border-[#eadbca] bg-white/90",
                flashing && "ring-2 ring-[#8fac91]"
              )}
            >
              {/* Hold meter fills the active tile as the pose is held. */}
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 bg-[#e9c79e]/55 transition-[width] duration-100"
                  style={{ width: `${Math.round(holdRatio * 100)}%` }}
                />
              )}

              <div className="relative flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full font-mono text-[9px] font-bold",
                    captured && "bg-[#5f7c63] text-white",
                    recording && "bg-[#a24c4d] text-white",
                    active && !recording && "bg-[#b9824e] text-white",
                    !captured && !active && !recording && "bg-[#f1e6d9] text-[#80634d]"
                  )}
                >
                  {captured ? (
                    <Check className="h-3 w-3" strokeWidth={3} />
                  ) : recording ? (
                    <Video className="h-3 w-3" />
                  ) : active ? (
                    i + 1
                  ) : (
                    <Circle className="h-2 w-2 fill-current" />
                  )}
                </span>
                <span
                  className={cn(
                    "truncate font-mono text-[10px] uppercase tracking-[0.2em]",
                    captured && "text-[#45634a]",
                    recording && "text-[#8f3739]",
                    active && !recording && "text-[#7d4f29]",
                    !captured && !active && !recording && "text-[#80634d]"
                  )}
                >
                  {STEP_SHORT_LABEL[step]}
                </span>
              </div>
            </div>
          </li>
        );
      })}

      <div className="sr-only" aria-live="polite">
        {recordingStep
          ? `Recording the ${recordingStep.toLowerCase()} view.`
          : `${capturedSteps.length} of ${CHALLENGE_SEQUENCE.length} directions captured.`}
      </div>
    </ol>
  );
}
