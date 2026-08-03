"use client";

import type { SkinAnalysisPayload } from "@/lib/scan/api";

const LABELS: Array<{ key: keyof SkinAnalysisPayload["scores"]; label: string }> = [
  { key: "hydration", label: "Hydration" },
  { key: "texture", label: "Texture" },
  { key: "evenness", label: "Even tone" },
  { key: "radiance", label: "Radiance" },
  { key: "firmness", label: "Firmness" },
];

/** Colour band by score. Every bar also shows its number, never colour alone. */
function toneFor(score: number): string {
  if (score >= 75) return "from-emerald-400 to-emerald-300";
  if (score >= 50) return "from-cyan-400 to-cyan-300";
  if (score >= 30) return "from-amber-400 to-amber-300";
  return "from-rose-500 to-rose-400";
}

export function SkinScoreBars({ scores }: { scores: SkinAnalysisPayload["scores"] }) {
  return (
    <ul className="flex flex-col gap-3.5">
      {LABELS.map(({ key, label }, i) => {
        const raw = scores[key];
        const value = Math.max(0, Math.min(100, Math.round(raw ?? 0)));
        return (
          <li key={key}>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-white/70">{label}</span>
              <span className="font-mono text-sm font-semibold tabular-nums text-white">
                {value}
                <span className="text-white/35">/100</span>
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className={`animate-meter h-full rounded-full bg-gradient-to-r ${toneFor(value)}`}
                style={{ width: `${value}%`, animationDelay: `${i * 70}ms` }}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={value}
                aria-label={label}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
