"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import confetti from "canvas-confetti";
import { scanApi, type ScanStatusResult, type SkinAnalysisPayload } from "@/lib/scan/api";
import { Button } from "@/components/ui/button";
import { SkinScoreBars } from "@/components/scan/SkinScoreBars";
import {
  ContourField,
  FaceMeshEmblem,
  ScoreRing,
  ViewfinderCorners,
} from "@/components/brand/ScanArtwork";
import { Droplets, Sparkles, ShieldCheck, RotateCcw, Loader2 } from "lucide-react";

const POLL_INTERVAL_MS = 3000;

/** Palette-matched confetti so the celebration belongs to the same product. */
const CONFETTI_COLORS = ["#b9824e", "#d5a568", "#5f7c63", "#3c2718", "#e9c79e"];

function triggerConfetti() {
  const count = 200;
  const defaults = { origin: { y: 0.7 }, colors: CONFETTI_COLORS };

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
        <div className="flex flex-col items-center gap-3 text-[#8b735f]">
          <Loader2 className="h-6 w-6 animate-spin text-[#b9824e]" />
          <p className="font-mono text-[10px] uppercase tracking-[0.3em]">Loading result</p>
        </div>
      </ResultShell>
    );
  }

  if (error) {
    return (
      <ResultShell>
        <div className="rounded-3xl border border-[#eadbca] bg-white p-8 text-center shadow-[0_20px_50px_rgba(72,43,24,0.10)]">
          <p className="font-medium text-[#9e3d3d]">{error}</p>
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
        <div className="animate-hud-rise rounded-3xl border border-[#eadbca] bg-white p-8 text-center shadow-[0_20px_50px_rgba(72,43,24,0.10)]">
          <FaceMeshEmblem className="mx-auto h-28 w-auto" />
          <p className="mt-4 font-serif text-2xl font-semibold text-[#3c2718]">
            Reading your scan…
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[#755d4a]">
            Your three clips are being analyzed. This usually takes a few seconds.
          </p>
        </div>
      </ResultShell>
    );
  }

  if (status === "failed") {
    return (
      <ResultShell>
        <div className="animate-hud-rise rounded-3xl border border-[#eadbca] bg-white p-8 text-center shadow-[0_20px_50px_rgba(72,43,24,0.10)]">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#9e3d3d]">
            Scan failed
          </p>
          <p className="mt-3 font-serif text-2xl font-semibold text-[#3c2718]">
            We could not read your face clearly
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[#755d4a]">
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
        <section className="animate-hud-rise relative overflow-hidden rounded-3xl border border-[#eadbca] bg-white px-6 py-10 text-center shadow-[0_20px_50px_rgba(72,43,24,0.10)]">
          <ViewfinderCorners className="m-4 hidden sm:block" />
          <div className="pointer-events-none absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 -translate-y-1/3 rounded-full bg-[#e9c79e]/45 blur-[90px]" />

          <div className="relative">
            <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-[#a9703e]">
              Your skin age
            </p>

            {skinAge !== null ? (
              <>
                <p className="animate-score-pop mt-4 font-serif text-8xl font-semibold leading-none tabular-nums text-[#3c2718]">
                  {skinAge}
                </p>
                <p className="mt-3 text-sm text-[#755d4a]">years, based on how your skin looks</p>
              </>
            ) : (
              <>
                <p className="mt-4 font-serif text-4xl font-semibold text-[#755d4a]">
                  Not available
                </p>
                <p className="mt-2 text-sm text-[#8b735f]">
                  {result?.skinStatus === "skipped"
                    ? "Skin scoring is not enabled on this deployment."
                    : "The skin read-out could not be produced for this scan."}
                </p>
              </>
            )}

            {ageRange && (
              <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-[#eadbca] bg-[#faf1e6] px-4 py-2">
                <ShieldCheck className="h-4 w-4 text-[#5f7c63]" />
                <span className="text-sm text-[#755d4a]">
                  Face-detection age band:{" "}
                  <strong className="font-semibold text-[#3c2718]">
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
                className="animate-hud-rise rounded-3xl border border-[#eadbca] bg-white p-6 shadow-[0_12px_32px_rgba(72,43,24,0.055)]"
                style={{ animationDelay: "80ms" }}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#f0e0cd] bg-[#faf1e6] text-[#a9703e]">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] leading-7 text-[#624d3d]">{skin.summary}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <Chip label={`Skin type: ${skin.skinType}`} />
                      <ScoreRing value={skin.confidence} label="Reading confidence" />
                    </div>
                  </div>
                </div>
              </section>
            )}

            <section
              className="animate-hud-rise rounded-3xl border border-[#eadbca] bg-white p-6 shadow-[0_12px_32px_rgba(72,43,24,0.055)]"
              style={{ animationDelay: "140ms" }}
            >
              <h2 className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#a9703e]">
                Skin stats
              </h2>
              <div className="mt-5">
                <SkinScoreBars scores={skin.scores} />
              </div>
            </section>

            {(skin.highlights.length > 0 || skin.concerns.length > 0) && (
              <section
                className="animate-hud-rise grid gap-4 sm:grid-cols-2"
                style={{ animationDelay: "200ms" }}
              >
                {skin.highlights.length > 0 && (
                  <div className="rounded-3xl border border-[#d9e2d8] bg-[#f6faf5] p-6">
                    <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#4d6b52]">
                      Doing well
                    </h3>
                    <ul className="mt-3 flex flex-col gap-2">
                      {skin.highlights.map((item) => (
                        <li key={item} className="flex gap-2 text-sm leading-relaxed text-[#4a5c4c]">
                          <span className="text-[#7d9a81]">▸</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {skin.concerns.length > 0 && (
                  <div className="rounded-3xl border border-[#eedcc4] bg-[#fdf7ee] p-6">
                    <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#a9703e]">
                      Watch out for
                    </h3>
                    <ul className="mt-3 flex flex-col gap-2">
                      {skin.concerns.map((item) => (
                        <li key={item} className="flex gap-2 text-sm leading-relaxed text-[#755d4a]">
                          <span className="text-[#c08d55]">▸</span>
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
                className="animate-hud-rise rounded-3xl border border-[#eadbca] bg-white p-6 shadow-[0_12px_32px_rgba(72,43,24,0.055)]"
                style={{ animationDelay: "260ms" }}
              >
                <h3 className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-[#a9703e]">
                  <Droplets className="h-3.5 w-3.5" /> Simple habits to try
                </h3>
                <ul className="mt-4 flex flex-col gap-3">
                  {skin.tips.map((tip, i) => (
                    <li key={tip} className="flex gap-3 text-sm leading-relaxed text-[#624d3d]">
                      <span className="font-mono text-xs font-bold text-[#c08d55]">
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

        <p className="px-2 text-center text-xs leading-relaxed text-[#8b735f]">
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
          <Button
            asChild
            variant="ghost"
            className="h-12 rounded-full px-8 text-[#755d4a] hover:bg-[#f7f0e8] hover:text-[#3c2718]"
          >
            <Link href="/">Back to home</Link>
          </Button>
        </div>
      </div>
    </ResultShell>
  );
}

function ResultShell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[#fcfaf7] px-4 py-10">
      <div className="scan-grid-warm pointer-events-none absolute inset-0" aria-hidden="true" />
      <ContourField className="inset-x-0 bottom-0 h-[30vh] w-full" />
      <div className={`relative z-10 w-full ${wide ? "max-w-xl" : "max-w-md"}`}>{children}</div>
    </main>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-[#eadbca] bg-[#faf1e6] px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-[#87572f]">
      {label}
    </span>
  );
}
