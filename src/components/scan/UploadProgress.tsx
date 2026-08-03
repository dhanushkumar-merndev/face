"use client";

/**
 * Upload progress states shown on the upload/analysis page.
 */
export const UPLOAD_STEPS = [
  "Preparing recording",
  "Uploading video",
  "Uploading best frame",
  "Analyzing face",
  "Saving result",
  "Complete",
] as const;

export function UploadProgress({
  current,
  failed,
}: {
  current: number;
  failed?: boolean;
}) {
  return (
    <ol className="flex flex-col gap-3" aria-label="Upload progress" aria-live="polite">
      {UPLOAD_STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex items-center gap-3">
            <span
              className={
                done
                  ? "flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-xs text-white"
                  : active
                    ? "flex h-6 w-6 items-center justify-center rounded-full border-2 border-primary"
                    : "flex h-6 w-6 items-center justify-center rounded-full border border-muted-foreground/40"
              }
            >
              {done ? "✓" : i + 1}
            </span>
            <span className={active ? "font-medium" : done ? "text-muted-foreground" : "text-muted-foreground/60"}>
              {label}
            </span>
          </li>
        );
      })}
      {failed && (
        <li className="text-sm font-medium text-red-600">
          Something went wrong. Please try again.
        </li>
      )}
    </ol>
  );
}
