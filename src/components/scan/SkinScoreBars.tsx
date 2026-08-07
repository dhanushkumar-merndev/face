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
  if (score >= 75) return "from-[#5f7c63] to-[#7d9a81]";
  if (score >= 50) return "from-[#b9824e] to-[#d5a568]";
  if (score >= 30) return "from-[#c08d55] to-[#e0b483]";
  return "from-[#9e3d3d] to-[#c06a6a]";
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
              <span className="text-sm text-[#6d5543]">{label}</span>
              <span className="font-mono text-sm font-semibold tabular-nums text-[#3c2718]">
                {value}
                <span className="text-[#a9917c]">/100</span>
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#f3e7da]">
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
