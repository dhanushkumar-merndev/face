"use client";

import {
  SCAN_CONFIG,
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
    <div className="rounded-2xl border border-[#eadbca] bg-white/95 p-4 text-[#3c2718] shadow-[0_12px_32px_rgba(72,43,24,0.12)] backdrop-blur-xl">
      {/* Kept above the instruction: on short desktop viewports anything below
          the hold meter is the first thing clipped, and this is the one line
          that explains why the scan has not started. */}
      {blocked && (
        <p
          className="mb-3 flex items-center gap-2 text-sm font-medium text-[#9a632e]"
          role="status"
          aria-live="polite"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {QUALITY_MESSAGE_TEXT[qualityMessage]}
        </p>
      )}

      {/* The panel mirrors for the right turn, so the arrow sits on the side
          the user is being asked to turn towards. */}
      <div className={cn("flex items-center gap-3.5", step === "RIGHT" && "flex-row-reverse")}>
        <span
          aria-hidden="true"
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border",
            recording
              ? "border-[#dba7a7] bg-[#fff0ef] text-[#9e3d3d]"
              : "border-[#e2c29d] bg-[#fff7ed] text-[#9a632e]"
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
          <p className="text-base font-semibold leading-tight text-[#3c2718] sm:text-lg">
            {headline}
          </p>
          {/* Wraps rather than truncates: the hint is the only text that says
              what to do next, and a cut-off half-sentence helps no one. */}
          <p className="mt-0.5 text-sm leading-snug text-[#755d4a]">{hint}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {recording && (
            <span className="flex items-center gap-1.5 rounded-full bg-[#fff0ef] px-2.5 py-1">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#a24c4d]" aria-hidden="true" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#9e3d3d]">
                Rec
              </span>
            </span>
          )}
          {step && <HoldCountdown holdRatio={holdRatio} recording={recording} />}
        </div>
      </div>

      {/* Hold meter — the countdown gives the number, this gives the fine
          detail of how much of the current second is banked. */}
      {step && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#efe2d4]">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-100",
              recording ? "bg-[#a24c4d]" : "bg-[#b9824e]"
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

/**
 * Seconds left on the hold, as a ring that drains while the pose is held.
 * Hidden from screen readers: the hold meter below already exposes a
 * progressbar, and announcing a number every second would be noise.
 */
function HoldCountdown({ holdRatio, recording }: { holdRatio: number; recording?: boolean }) {
  const ratio = Math.max(0, Math.min(1, holdRatio));
  const secondsLeft = Math.ceil(((1 - ratio) * SCAN_CONFIG.requiredHoldMs) / 1000);
  const radius = 18;
  const circumference = 2 * Math.PI * radius;

  return (
    <span className="relative grid h-12 w-12 shrink-0 place-items-center" aria-hidden="true">
      <svg viewBox="0 0 44 44" className="absolute inset-0 h-full w-full -rotate-90">
        <circle cx="22" cy="22" r={radius} fill="none" stroke="#efe2d4" strokeWidth="3.5" />
        <circle
          cx="22"
          cy="22"
          r={radius}
          fill="none"
          stroke={recording ? "#a24c4d" : "#b9824e"}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          className="transition-[stroke-dashoffset] duration-100"
        />
      </svg>
      <span className="relative font-mono text-sm font-bold tabular-nums text-[#3c2718]">
        {secondsLeft}
      </span>
    </span>
  );
}
