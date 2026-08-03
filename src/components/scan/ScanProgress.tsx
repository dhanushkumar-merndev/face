"use client";

import { CHALLENGE_SEQUENCE } from "@/lib/face/config";
import { cn } from "@/lib/utils";

/**
 * Five-step progress indicator: CENTER -> LEFT -> RIGHT -> UP -> CENTER_FINAL.
 * Numbered for accessibility; also shows the current hold progress.
 */
export function ScanProgress({
  currentIndex,
  holdProgressMs,
  requiredHoldMs,
}: {
  currentIndex: number;
  holdProgressMs?: number;
  requiredHoldMs: number;
}) {
  return (
    <ol className="flex items-center justify-center gap-2" aria-label="Scan progress">
      {CHALLENGE_SEQUENCE.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <li key={step} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold",
                done && "border-emerald-500 bg-emerald-500 text-white",
                active && "border-primary bg-primary text-primary-foreground",
                !done && !active && "border-muted-foreground/40 text-muted-foreground"
              )}
              aria-current={active ? "step" : undefined}
            >
              {done ? "✓" : i + 1}
            </span>
            {i < CHALLENGE_SEQUENCE.length - 1 && (
              <span className="h-px w-4 bg-muted-foreground/30" aria-hidden="true" />
            )}
          </li>
        );
      })}

      {currentIndex < CHALLENGE_SEQUENCE.length && holdProgressMs !== undefined && (
        <div className="sr-only" aria-live="polite">
          Holding step {currentIndex + 1}: {Math.round((holdProgressMs / requiredHoldMs) * 100)}%
        </div>
      )}
    </ol>
  );
}
