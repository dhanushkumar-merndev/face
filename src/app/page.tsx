import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ScanFace, Sparkles, Timer, Trash2 } from "lucide-react";

export const metadata = {
  title: "Find Your Skin Age",
  description:
    "A 20-second face scan that reads your skin and reveals how old it looks. Private by default.",
};

const STEPS = [
  { n: "01", title: "Look straight", body: "The scanner locks onto your face and records the front view." },
  { n: "02", title: "Turn left", body: "A second clip captures your left profile and skin texture." },
  { n: "03", title: "Turn right", body: "The last clip completes the scan and the reading begins." },
];

export default function Home() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-16">
      <div className="scan-grid pointer-events-none absolute inset-0 opacity-25" aria-hidden="true" />
      <div className="pointer-events-none absolute left-1/2 top-1/4 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/20 blur-[130px]" />

      <div className="relative z-10 flex w-full max-w-2xl flex-col items-center text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-400/10 px-4 py-1.5">
          <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-cyan-200">
            Face scan challenge
          </span>
        </span>

        <h1 className="mt-6 text-5xl font-black leading-[1.05] tracking-tight sm:text-7xl">
          Find your
          <span className="block bg-gradient-to-r from-cyan-300 via-sky-300 to-emerald-300 bg-clip-text text-transparent">
            skin age
          </span>
        </h1>

        <p className="mt-5 max-w-lg text-balance text-base text-white/60">
          Three quick head turns. The scanner maps your face structure, reads your skin, and reveals
          how old your skin looks — plus what it likes and what it needs.
        </p>

        <Button
          asChild
          size="lg"
          className="mt-9 h-14 rounded-full px-12 text-base font-bold shadow-[0_0_40px_-8px_rgba(34,211,238,0.7)]"
        >
          <Link href="/scan/capture">
            <ScanFace /> Start the scan
          </Link>
        </Button>

        <p className="mt-4 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.25em] text-white/35">
          <Timer className="h-3 w-3" /> Takes about 20 seconds
        </p>

        <ol className="mt-14 grid w-full gap-3 sm:grid-cols-3">
          {STEPS.map((step) => (
            <li key={step.n} className="hud-panel rounded-2xl p-5 text-left">
              <span className="font-mono text-xs font-bold text-cyan-300">{step.n}</span>
              <h2 className="mt-2 font-semibold text-white">{step.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-white/50">{step.body}</p>
            </li>
          ))}
        </ol>

        <ul className="mt-10 grid w-full gap-x-6 gap-y-2 text-left text-sm text-white/45 sm:grid-cols-2">
          <li>• Front camera only — no audio recorded</li>
          <li>• Clips stored encrypted, deleted after 30 days</li>
          <li>• Never used for identity matching</li>
          <li className="flex items-center gap-1.5">
            <Trash2 className="h-3.5 w-3.5" /> Delete everything whenever you want
          </li>
        </ul>

        <p className="mt-10 max-w-md text-xs leading-relaxed text-white/30">
          Skin age is a cosmetic impression for fun, not a medical assessment or proof of age. By
          starting a scan you agree to our{" "}
          <Link href="/privacy" className="underline hover:text-white/60">
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link href="/terms" className="underline hover:text-white/60">
            Terms
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
