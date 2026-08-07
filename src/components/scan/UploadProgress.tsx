"use client";

import { cn } from "@/lib/utils";
import { FaceMeshEmblem } from "@/components/brand/ScanArtwork";
import { Check, Loader2 } from "lucide-react";

/**
 * Analysis console shown after the three directions are captured. The camera
 * phases run on a dark surface for video contrast; once capture is over the
 * flow returns to the warm surface used by the landing and result pages.
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
  const lastIndex = UPLOAD_STEPS.length - 1;
  const pct = Math.round((Math.min(current, lastIndex) / lastIndex) * 100);

  return (
    <div className="rounded-3xl border border-[#eadbca] bg-white p-7 text-[#3c2718] shadow-[0_20px_50px_rgba(72,43,24,0.10)] sm:p-8">
      <div className="flex flex-col items-center text-center">
        <FaceMeshEmblem className="h-28 w-auto sm:h-32" />
        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.35em] text-[#a9703e]">
          Analyzing
        </p>
        <h2 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-[#3c2718]">
          Reading your skin age
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[#755d4a]">
          Hold tight — this usually takes a few seconds.
        </p>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#efe2d4]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#b9824e] to-[#d5a568] transition-[width] duration-500"
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label="Analysis progress"
          />
        </div>
        <span className="font-mono text-xs font-semibold tabular-nums text-[#a9703e]">{pct}%</span>
      </div>

      <ol className="mt-6 flex flex-col" aria-label="Analysis steps" aria-live="polite">
        {UPLOAD_STEPS.map((label, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={label} className="flex gap-3">
              {/* Marker column doubles as the rail connecting the steps. */}
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold transition-colors",
                    done && "bg-[#5f7c63] text-white",
                    active && !done && "bg-[#b9824e] text-white",
                    !done && !active && "border border-[#decbb8] text-[#9b7d63]"
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
                {i < lastIndex && (
                  <span
                    className={cn("w-px flex-1", done ? "bg-[#c3d0c2]" : "bg-[#eadbca]")}
                    aria-hidden="true"
                  />
                )}
              </div>

              <span
                className={cn(
                  "pb-3.5 text-sm",
                  active && "font-semibold text-[#3c2718]",
                  done && "text-[#6b806e]",
                  !done && !active && "text-[#9b7d63]"
                )}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>

      {failed && (
        <p className="mt-2 rounded-xl border border-[#e8c9c9] bg-[#fdf5f4] px-4 py-3 text-sm font-medium text-[#9e3d3d]">
          Something went wrong. Please try again.
        </p>
      )}
    </div>
  );
}
