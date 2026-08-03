"use client";

import { cn } from "@/lib/utils";
import { Check, Loader2 } from "lucide-react";

/**
 * Analysis console shown after the three directions are captured.
 */
export const UPLOAD_STEPS = [
  "Packing your three clips",
  "Requesting secure upload",
  "Uploading clips and frames",
  "Reading your skin",
  "Result ready",
] as const;

export function UploadProgress({
  current,
  failed,
}: {
  current: number;
  failed?: boolean;
}) {
  const pct = Math.round((Math.min(current, UPLOAD_STEPS.length - 1) / (UPLOAD_STEPS.length - 1)) * 100);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl">
      <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-cyan-300/80">
        Analyzing
      </p>
      <h2 className="mt-2 text-2xl font-bold text-white">Reading your skin age</h2>

      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-300 transition-[width] duration-500"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="Analysis progress"
        />
      </div>

      <ol className="mt-6 flex flex-col gap-3" aria-label="Analysis progress" aria-live="polite">
        {UPLOAD_STEPS.map((label, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={label} className="flex items-center gap-3">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                  done && "bg-emerald-400 text-slate-950",
                  active && !done && "bg-cyan-300 text-slate-950",
                  !done && !active && "border border-white/20 text-white/40"
                )}
              >
                {done ? (
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                ) : active ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  i + 1
                )}
              </span>
              <span
                className={cn(
                  "text-sm",
                  active && "font-medium text-white",
                  done && "text-white/50",
                  !done && !active && "text-white/30"
                )}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>

      {failed && (
        <p className="mt-5 text-sm font-medium text-rose-400">
          Something went wrong. Please try again.
        </p>
      )}
    </div>
  );
}
