"use client";

import { STEP_INSTRUCTION_TEXT, QUALITY_MESSAGE_TEXT, type QualityMessage } from "@/lib/face/config";

/**
 * Current direction instruction with an aria-live announcement so screen
 * readers hear step changes. Text + visual arrow, never color-only.
 */
export function DirectionInstruction({
  step,
  qualityMessage,
}: {
  step: "CENTER" | "LEFT" | "RIGHT" | "UP" | "CENTER_FINAL" | null;
  qualityMessage?: QualityMessage;
}) {
  const text = step ? STEP_INSTRUCTION_TEXT[step] : "Preparing…";
  const arrow =
    step === "LEFT" ? "←" : step === "RIGHT" ? "→" : step === "UP" ? "↑" : step ? "•" : "";

  return (
    <div className="flex flex-col items-center gap-1" aria-live="polite">
      <span className="text-3xl" aria-hidden="true">
        {arrow}
      </span>
      <p className="text-lg font-semibold">{text}</p>
      {qualityMessage && qualityMessage !== "ok" && (
        <p className="text-sm text-red-600" role="status">
          {QUALITY_MESSAGE_TEXT[qualityMessage]}
        </p>
      )}
    </div>
  );
}
