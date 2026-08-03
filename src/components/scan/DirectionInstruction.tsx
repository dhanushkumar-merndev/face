"use client";

import {
  STEP_INSTRUCTION_TEXT,
  STEP_HINT_TEXT,
  QUALITY_MESSAGE_TEXT,
  type QualityMessage,
} from "@/lib/face/config";
import type { ChallengeStep } from "@/lib/face/types";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight, ScanFace, AlertTriangle } from "lucide-react";

/**
 * Bottom instruction panel. Direction is conveyed by text plus an icon — never
 * by colour alone — and step changes are announced to screen readers.
 */
export function DirectionInstruction({
  step,
  qualityMessage,
  recording,
  holdRatio = 0,
  preparing,
}: {
  step: ChallengeStep | null;
  qualityMessage?: QualityMessage;
  recording?: boolean;
  holdRatio?: number;
  preparing?: boolean;
}) {
  const blocked = qualityMessage !== undefined && qualityMessage !== "ok";

  const headline = preparing
    ? "Line your face up with the outline"
    : step
      ? STEP_INSTRUCTION_TEXT[step]
      : "Processing…";

  const hint = preparing
    ? "The scan starts automatically once you are in frame"
    : step
      ? STEP_HINT_TEXT[step]
      : "Hold on a moment";

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-5 backdrop-blur-xl">
      {/* Kept above the instruction: on short desktop viewports anything below
          the hold meter is the first thing clipped, and this is the one line
          that explains why the scan has not started. */}
      {blocked && (
        <p
          className="mb-3 flex items-center gap-2 text-sm font-medium text-amber-300"
          role="status"
          aria-live="polite"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {QUALITY_MESSAGE_TEXT[qualityMessage]}
        </p>
      )}

      <div className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border",
            recording
              ? "border-rose-400/50 bg-rose-500/20 text-rose-200"
              : "border-cyan-300/40 bg-cyan-400/15 text-cyan-200"
          )}
        >
          {step === "LEFT" ? (
            <ArrowLeft className="h-6 w-6" />
          ) : step === "RIGHT" ? (
            <ArrowRight className="h-6 w-6" />
          ) : (
            <ScanFace className="h-6 w-6" />
          )}
        </span>

        <div className="min-w-0 flex-1" aria-live="polite">
          <p className="text-lg font-semibold leading-tight text-white">{headline}</p>
          <p className="mt-0.5 truncate text-sm text-white/55">{hint}</p>
        </div>

        {recording && (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-rose-500/20 px-2.5 py-1">
            <span className="h-2 w-2 animate-pulse rounded-full bg-rose-400" aria-hidden="true" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-rose-200">Rec</span>
          </span>
        )}
      </div>

      {/* Hold meter */}
      {step && (
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-100",
              recording ? "bg-rose-400" : "bg-cyan-300"
            )}
            style={{ width: `${Math.round(Math.min(1, holdRatio) * 100)}%` }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(Math.min(1, holdRatio) * 100)}
            aria-label="Hold progress"
          />
        </div>
      )}
    </div>
  );
}
