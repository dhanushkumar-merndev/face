"use client";

import { QUALITY_MESSAGE_TEXT, type QualityMessage } from "@/lib/face/config";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

export function QualityMessage({
  message,
  showOk = false,
}: {
  message: QualityMessage | null;
  showOk?: boolean;
}) {
  if (!message || message === "ok") {
    if (showOk && message === "ok") {
      return (
        <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
          <CheckCircle2 className="h-4 w-4" /> Face detected
        </p>
      );
    }
    return null;
  }

  return (
    <p
      className="flex items-center gap-1.5 text-sm font-medium text-red-600"
      role="status"
      aria-live="polite"
    >
      <AlertTriangle className="h-4 w-4" />
      {QUALITY_MESSAGE_TEXT[message]}
    </p>
  );
}
