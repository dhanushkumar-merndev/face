import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  Droplets,
  Gauge,
  ListChecks,
  ScanFace,
  ShieldCheck,
  Sparkles,
  ThumbsUp,
  Timer,
} from "lucide-react";
import {
  ContourField,
  FaceMeshEmblem,
  HeadPoseIcon,
  ScanDivider,
  ViewfinderCorners,
} from "@/components/brand/ScanArtwork";

export const metadata = {
  title: "Find Your Skin Age",
  description:
    "A 20-second face scan that reads your skin and reveals how old it looks. Private by default.",
};

const STEPS = [
  {
    n: "01",
    pose: "front",
    title: "Look straight",
    body: "The scanner locks onto your face and records the front view.",
  },
  {
    n: "02",
    pose: "left",
    title: "Turn left",
    body: "A second clip captures your left profile and skin texture.",
  },
  {
    n: "03",
    pose: "right",
    title: "Turn right",
    body: "The last clip completes the scan and the reading begins.",
  },
] as const;

/** Mirrors what the result page actually renders once a scan completes. */
const READOUT = [
  {
    icon: Gauge,
    title: "Your skin age",
    body: "One number for how old your skin looks, with a confidence rating for the reading.",
  },
  {
    icon: ShieldCheck,
    title: "A second age band",
    body: "The face-detection age range, shown beside the skin reading as a cross-check.",
  },
  {
    icon: BarChart3,
    title: "Five skin scores",
    body: "Hydration, texture, evenness, radiance and firmness, each scored out of 100.",
  },
  {
    icon: Droplets,
    title: "Your skin type",
    body: "Dry, oily, combination, normal or sensitive — in one line, no jargon.",
  },
  {
    icon: ThumbsUp,
    title: "Doing well & watch-outs",
    body: "What your skin has going for it, plus the things worth keeping an eye on.",
  },
  {
    icon: ListChecks,
    title: "Simple habits",
    body: "Up to five gentle everyday tips. Nothing clinical, no prescriptions, no procedures.",
  },
];

const SAMPLE_SCORES = [
  { label: "Hydration", value: 78 },
  { label: "Texture", value: 84 },
  { label: "Evenness", value: 80 },
  { label: "Radiance", value: 86 },
  { label: "Firmness", value: 82 },
];

export default function Home() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center overflow-hidden bg-[#fcfaf7] px-4 py-14 sm:py-20">
      <div className="scan-grid-warm pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="pointer-events-none absolute left-1/2 top-1/4 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#e4c49e]/35 blur-[130px]" />
      <ContourField className="inset-x-0 bottom-0 h-[36vh] w-full" />

      <div className="relative z-10 flex w-full max-w-5xl flex-col items-center">
        {/* Hero */}
        <section className="relative flex w-full max-w-2xl flex-col items-center px-6 py-8 text-center sm:px-10">
          <ViewfinderCorners className="hidden sm:block" />

          <FaceMeshEmblem />

          <span className="mt-6 inline-flex items-center gap-2 rounded-full border border-[#e5cdb1] bg-white/80 px-4 py-1.5 shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-[#b67a42]" />
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#87572f]">
              Face scan challenge
            </span>
          </span>

          <h1 className="mt-6 font-serif text-5xl font-semibold leading-[1.05] tracking-tight text-[#3c2718] sm:text-7xl">
            Find your
            <span className="block bg-gradient-to-r from-[#9c6030] via-[#c48b51] to-[#a9703e] bg-clip-text italic text-transparent">
              skin age
            </span>
          </h1>

          <p className="mt-5 max-w-lg text-balance text-base leading-7 text-[#6d5543]">
            Three quick head turns. The scanner maps your face structure, reads your skin, and
            reveals how old your skin looks — plus what it likes and what it needs.
          </p>

          <div className="relative mt-9 inline-flex">
            <span
              className="animate-halo pointer-events-none absolute inset-0 rounded-full border border-[#c99a63]"
              aria-hidden="true"
            />
            <Button
              asChild
              size="lg"
              className="relative h-14 rounded-full px-12 text-base font-bold shadow-[0_16px_26px_-12px_rgba(53,29,15,0.55)]"
            >
              <Link href="/scan/capture">
                <ScanFace /> Start the scan
              </Link>
            </Button>
          </div>

          <p className="mt-4 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.25em] text-[#9d7b5d]">
            <Timer className="h-3 w-3" /> Takes about 20 seconds
          </p>
        </section>

        {/* Steps */}
        <ol className="mt-12 grid w-full max-w-3xl gap-3 sm:grid-cols-3">
          {STEPS.map((step) => (
            <li
              key={step.n}
              className="rounded-2xl border border-[#eadbca] bg-white/85 p-5 text-left shadow-[0_12px_32px_rgba(72,43,24,0.055)] transition hover:-translate-y-0.5 hover:border-[#e0c3a0] hover:shadow-[0_18px_40px_rgba(72,43,24,0.09)]"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-[#b67a42]">{step.n}</span>
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#f0e0cd] bg-[#faf1e6] text-[#a9703e]">
                  <HeadPoseIcon pose={step.pose} />
                </span>
              </div>
              <h2 className="mt-3 font-semibold text-[#3c2718]">{step.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-[#755d4a]">{step.body}</p>
            </li>
          ))}
        </ol>

        {/* What the reading returns */}
        <section className="mt-16 w-full">
          <ScanDivider />

          <div className="mt-10 grid gap-10 lg:grid-cols-[1.05fr_1fr] lg:items-start">
            <div>
              <p className="admin-eyebrow">After the scan</p>
              <h2 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-[#3c2718] sm:text-4xl">
                What you actually get
              </h2>
              <p className="mt-3 max-w-md text-[15px] leading-7 text-[#6d5543]">
                The reading lands a few seconds after the third clip. Everything below appears on
                your result page — no account, no waiting list.
              </p>

              <ul className="mt-8 grid gap-x-6 gap-y-6 sm:grid-cols-2">
                {READOUT.map((item) => (
                  <li key={item.title} className="flex gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#f0e0cd] bg-white text-[#a9703e]">
                      <item.icon className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-[#3c2718]">{item.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-[#755d4a]">{item.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Sample result card */}
            <div className="relative rounded-3xl border border-[#eadbca] bg-white p-6 shadow-[0_18px_48px_rgba(72,43,24,0.08)] sm:p-8">
              <div className="flex items-center justify-between">
                <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#a9703e]">
                  Sample read-out
                </p>
                <ScanFace className="h-4 w-4 text-[#c9a882]" aria-hidden="true" />
              </div>

              <p className="mt-6 font-serif text-6xl font-semibold tabular-nums leading-none text-[#3c2718]">
                27
                <span className="ml-2 font-sans text-base font-medium text-[#9d7b5d]">years</span>
              </p>
              <p className="mt-2 text-sm text-[#755d4a]">
                How old your skin looks — not your real age.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full border border-[#eadbca] bg-[#faf1e6] px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-[#87572f]">
                  Type: combination
                </span>
                <span className="rounded-full border border-[#eadbca] bg-[#faf1e6] px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-[#87572f]">
                  Confidence 72%
                </span>
              </div>

              <dl className="mt-7 space-y-3">
                {SAMPLE_SCORES.map((score) => (
                  <div key={score.label}>
                    <div className="flex items-baseline justify-between text-xs">
                      <dt className="font-medium text-[#6d5543]">{score.label}</dt>
                      <dd className="font-mono tabular-nums text-[#a9703e]">{score.value}</dd>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#f3e7da]">
                      <div
                        className="animate-meter h-full rounded-full bg-gradient-to-r from-[#c48b51] to-[#9c6030]"
                        style={{ width: `${score.value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </dl>

              <p className="mt-6 border-t border-[#f0e6da] pt-4 text-xs leading-relaxed text-[#8b735f]">
                Plus a short written summary, what your skin is doing well, what to watch, and five
                habits to try.
              </p>
            </div>
          </div>
        </section>

        {/* Legal */}
        <p className="mt-16 max-w-lg text-center text-xs leading-relaxed text-[#8b735f]">
          Skin age is a cosmetic impression for fun, not a medical assessment or proof of age. Your
          clips stay private, are stored encrypted, and you can delete them at any time — the
          details are in our{" "}
          <Link href="/privacy" className="font-medium text-[#7d4f29] underline hover:text-[#3c2718]">
            Privacy Policy
          </Link>
          . By starting a scan you agree to it and to our{" "}
          <Link href="/terms" className="font-medium text-[#7d4f29] underline hover:text-[#3c2718]">
            Terms
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
