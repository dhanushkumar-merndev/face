"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import confetti from "canvas-confetti";
import { scanApi, type ScanStatusResult, type SkinAnalysisPayload } from "@/lib/scan/api";
import { Button } from "@/components/ui/button";
import { SkinScoreBars } from "@/components/scan/SkinScoreBars";
import { Droplets, Sparkles, ShieldCheck, RotateCcw, Loader2 } from "lucide-react";

const POLL_INTERVAL_MS = 3000;

function triggerConfetti() {
  const count = 200;
  const defaults = { origin: { y: 0.7 } };

  function fire(particleRatio: number, opts: confetti.Options) {
    confetti({
      ...defaults,
      ...opts,
      particleCount: Math.floor(count * particleRatio),
    });
  }

  fire(0.25, {
    spread: 26,
    startVelocity: 55,
  });
  fire(0.2, { spread: 60 });
  fire(0.35, {
    spread: 100,
    decay: 0.91,
    scalar: 0.8,
  });
  fire(0.1, {
    spread: 120,
    startVelocity: 25,
    decay: 0.92,
    scalar: 1.2,
  });
  fire(0.1, {
    spread: 120,
    startVelocity: 45,
  });
}

export default function ScanResultPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const router = useRouter();
  const [result, setResult] = useState<ScanStatusResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const settledRef = useRef(false);
  const confettiFiredRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await scanApi.status(sessionId);
      if (!res.success) {
        setError(res.error.message);
        settledRef.current = true;
        return;
      }
      setResult(res.data);
      if (res.data.status === "completed" || res.data.status === "failed") {
        settledRef.current = true;
      }
    } catch (err) {
      console.error(err);
      setError("Could not load the scan result.");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    // Stop polling once the scan reaches a terminal state.
    const id = setInterval(() => {
      if (settledRef.current) {
        clearInterval(id);
        return;
      }
      void load();
    }, POLL_INTERVAL_MS);
    return () => {
      clearInterval(id);
      clearTimeout(t);
    };
  }, [load]);

  useEffect(() => {
    if (result?.status === "completed" && !confettiFiredRef.current) {
      confettiFiredRef.current = true;
      triggerConfetti();
    }
  }, [result?.status]);

  if (loading) {
    return (
      <ResultShell>
        <div className="flex flex-col items-center gap-3 text-white/60">
          <Loader2 className="h-6 w-6 animate-spin text-cyan-300" />
          <p className="font-mono text-xs uppercase tracking-[0.3em]">Loading result</p>
        </div>
      </ResultShell>
    );
  }

  if (error) {
    return (
      <ResultShell>
        <div className="hud-panel rounded-3xl p-8 text-center">
          <p className="font-medium text-rose-400">{error}</p>
          <Button
            onClick={() => router.push("/scan/capture")}
            className="mt-6 h-12 rounded-full px-8 font-semibold"
          >
            Start a new scan
          </Button>
        </div>
      </ResultShell>
    );
  }

  const status = result?.status;
  const ageRange = result?.ageRange;
  const skin = result?.skin as SkinAnalysisPayload | null | undefined;
  const skinAge = result?.skinAge ?? skin?.skinAge ?? null;

  if (status !== "completed" && status !== "failed") {
    return (
      <ResultShell>
        <div className="hud-panel animate-hud-rise rounded-3xl p-8 text-center">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-cyan-300" />
          <p className="mt-4 text-xl font-semibold">Reading your scan…</p>
          <p className="mt-2 text-sm text-white/55">
            Your three clips are being analyzed. This usually takes a few seconds.
          </p>
        </div>
      </ResultShell>
    );
  }

  if (status === "failed") {
    return (
      <ResultShell>
        <div className="hud-panel animate-hud-rise rounded-3xl p-8 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-rose-400">Scan failed</p>
          <p className="mt-3 text-xl font-semibold">We could not read your face clearly</p>
          <p className="mt-2 text-sm text-white/55">
            {result?.failureMessage ?? "No result has been saved."} Try again in even lighting with
            nothing covering your face.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button
              onClick={() => router.push("/scan/capture")}
              className="h-12 rounded-full px-8 font-semibold"
            >
              <RotateCcw /> Scan again
            </Button>
          </div>
        </div>
      </ResultShell>
    );
  }

  return (
    <ResultShell wide>
      <div className="flex w-full flex-col gap-4">
        {/* Hero score */}
        <section className="hud-panel animate-hud-rise relative overflow-hidden rounded-3xl p-8 text-center">
          <div className="pointer-events-none absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/25 blur-[90px]" />
          <div className="relative">
            <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-cyan-300/80">
              Your skin age
            </p>

            {skinAge !== null ? (
              <>
                <p className="animate-score-pop mt-3 text-7xl font-black tabular-nums text-white drop-shadow-[0_0_30px_rgba(34,211,238,0.45)]">
                  {skinAge}
                </p>
                <p className="mt-1 text-sm text-white/50">years, based on how your skin looks</p>
              </>
            ) : (
              <>
                <p className="mt-3 text-4xl font-bold text-white/70">Not available</p>
                <p className="mt-2 text-sm text-white/50">
                  {result?.skinStatus === "skipped"
                    ? "Skin scoring is not enabled on this deployment."
                    : "The skin read-out could not be produced for this scan."}
                </p>
              </>
            )}

            {ageRange && (
              <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2">
                <ShieldCheck className="h-4 w-4 text-emerald-300" />
                <span className="text-sm text-white/70">
                  Face-detection age band:{" "}
                  <strong className="font-semibold text-white">
                    {ageRange.low}–{ageRange.high}
                  </strong>
                </span>
              </div>
            )}
          </div>
        </section>

        {skin && (
          <>
            {skin.summary && (
              <section
                className="hud-panel animate-hud-rise rounded-3xl p-6"
                style={{ animationDelay: "80ms" }}
              >
                <div className="flex items-start gap-3">
                  <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" />
                  <div>
                    <p className="text-sm leading-relaxed text-white/80">{skin.summary}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Chip label={`Skin type: ${skin.skinType}`} />
                      <Chip label={`Confidence: ${Math.round(skin.confidence * 100)}%`} />
                    </div>
                  </div>
                </div>
              </section>
            )}

            <section
              className="hud-panel animate-hud-rise rounded-3xl p-6"
              style={{ animationDelay: "140ms" }}
            >
              <h2 className="font-mono text-[10px] uppercase tracking-[0.3em] text-cyan-300/80">
                Skin stats
              </h2>
              <div className="mt-4">
                <SkinScoreBars scores={skin.scores} />
              </div>
            </section>

            {(skin.highlights.length > 0 || skin.concerns.length > 0) && (
              <section
                className="animate-hud-rise grid gap-4 sm:grid-cols-2"
                style={{ animationDelay: "200ms" }}
              >
                {skin.highlights.length > 0 && (
                  <div className="hud-panel rounded-3xl p-6">
                    <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-emerald-300/90">
                      Doing well
                    </h3>
                    <ul className="mt-3 flex flex-col gap-2">
                      {skin.highlights.map((item) => (
                        <li key={item} className="flex gap-2 text-sm text-white/75">
                          <span className="text-emerald-300">▸</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {skin.concerns.length > 0 && (
                  <div className="hud-panel rounded-3xl p-6">
                    <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-amber-300/90">
                      Watch out for
                    </h3>
                    <ul className="mt-3 flex flex-col gap-2">
                      {skin.concerns.map((item) => (
                        <li key={item} className="flex gap-2 text-sm text-white/75">
                          <span className="text-amber-300">▸</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}

            {skin.tips.length > 0 && (
              <section
                className="hud-panel animate-hud-rise rounded-3xl p-6"
                style={{ animationDelay: "260ms" }}
              >
                <h3 className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-cyan-300/80">
                  <Droplets className="h-3.5 w-3.5" /> Simple habits to try
                </h3>
                <ul className="mt-3 flex flex-col gap-2.5">
                  {skin.tips.map((tip, i) => (
                    <li key={tip} className="flex gap-3 text-sm text-white/75">
                      <span className="font-mono text-xs text-cyan-300/70">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        <p className="px-2 text-center text-xs leading-relaxed text-white/40">
          For fun and general skincare curiosity only. Skin age is a cosmetic impression, not a
          medical assessment, and the age band is approximate — neither is proof of age, and neither
          should be used for legal, alcohol, gambling, employment, insurance, credit, policing or
          access-control decisions.
        </p>

        <div className="flex flex-col gap-3 pb-4 sm:flex-row sm:justify-center">
          <Button
            onClick={() => router.push("/scan/capture")}
            className="h-12 rounded-full px-8 font-semibold"
          >
            <RotateCcw /> Scan again
          </Button>
        </div>
      </div>
    </ResultShell>
  );
}

function ResultShell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-slate-950 px-4 py-10">
      <div className="scan-grid pointer-events-none absolute inset-0 opacity-20" aria-hidden="true" />
      <div className={`relative z-10 w-full ${wide ? "max-w-xl" : "max-w-md"}`}>{children}</div>
    </main>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-white/60">
      {label}
    </span>
  );
}
