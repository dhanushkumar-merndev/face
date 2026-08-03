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
                "relative overflow-hidden rounded-xl border px-3 py-2.5 backdrop-blur transition-all duration-300",
                captured && "border-emerald-400/60 bg-emerald-400/10",
                recording && "border-rose-400/70 bg-rose-500/15",
                active && !recording && "border-cyan-300/60 bg-cyan-400/10",
                !captured && !active && !recording && "border-white/10 bg-white/5",
                flashing && "ring-2 ring-emerald-300/70"
              )}
            >
              {/* Hold meter fills the active tile as the pose is held. */}
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 bg-cyan-400/20 transition-[width] duration-100"
                  style={{ width: `${Math.round(holdRatio * 100)}%` }}
                />
              )}

              <div className="relative flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                    captured && "bg-emerald-400 text-slate-950",
                    recording && "bg-rose-500 text-white",
                    active && !recording && "bg-cyan-300 text-slate-950",
                    !captured && !active && !recording && "bg-white/15 text-white/60"
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
                    captured && "text-emerald-200",
                    recording && "text-rose-100",
                    active && !recording && "text-cyan-100",
                    !captured && !active && !recording && "text-white/45"
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
