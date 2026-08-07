import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { PrivateVideoPlayer } from "@/components/admin/PrivateVideoPlayer";
import { AdminDeleteButton } from "@/components/admin/AdminDeleteButton";
import { AdminRetryButton } from "@/components/admin/AdminRetryButton";
import { AdminDownloadButton } from "@/components/admin/AdminDownloadButton";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Admin — Scan Detail" };

type SkinAnalysisRow = {
  skinAge?: number;
  confidence?: number;
  skinType?: string;
  scores?: Record<string, number>;
  concerns?: string[];
  highlights?: string[];
  tips?: string[];
  summary?: string;
};

type ScanDetail = {
  id: string;
  status: string;
  failure_code: string | null;
  failure_message: string | null;
  skin_age: number | null;
  skin_status: string | null;
  skin_analysis: SkinAnalysisRow | null;
};

export default async function AdminScanDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");

  const { sessionId } = await params;
  const supabase = getSupabaseAdmin();
  const { data: scan } = await supabase
    .from("scan_sessions")
    // The steps/assets/audit joins backed cards that no longer exist.
    .select("*")
    .eq("id", sessionId)
    .single();

  if (!scan) redirect("/admin/scans");

  const detail = scan as unknown as ScanDetail;
  const analysis = detail.skin_analysis;

  const statusBadge: "success" | "destructive" | "secondary" | "warning" =
    detail.status === "completed"
      ? "success"
      : detail.status === "failed"
        ? "destructive"
        : detail.status === "deleted"
          ? "secondary"
          : "warning";

  return (
    <div className="min-h-dvh bg-[#fcfaf7]">
      <AdminTopbar />
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/admin/scans" className="text-sm text-muted-foreground hover:underline">
            ← Back
          </Link>
          <h1 className="admin-heading text-3xl">Scan {sessionId.slice(0, 8)}</h1>
          <Badge variant={statusBadge}>{detail.status}</Badge>
        </div>
        {detail.status !== "deleted" && <AdminDownloadButton sessionId={sessionId} />}
      </div>

      <div className="flex flex-col gap-6">
        <Card className="admin-card overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">Media</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {detail.status === "deleted" ? (
              <p className="text-sm text-muted-foreground">Media was deleted.</p>
            ) : (
              <>
                <PrivateVideoPlayer sessionId={sessionId} />
                {/* Frames are served through short-lived signed redirects. */}
                <div className="grid gap-3 sm:grid-cols-3">
                  {["CENTER", "LEFT", "RIGHT"].map((step) => (
                    <figure key={step} className="flex flex-col gap-1.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/admin/scans/${sessionId}/best-frame?step=${step}`}
                        alt={`${step} capture frame`}
                        className="aspect-square w-full rounded-lg border border-[#eadbca] object-cover"
                        loading="lazy"
                      />
                      <figcaption className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        {step} frame
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="admin-card">
          <CardHeader>
            <CardTitle className="text-base">Skin analysis</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-2xl border border-[#eadbca] bg-[#fdf8f2] px-5 py-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#a9703e]">
                  Skin age
                </p>
                <p className="mt-1 font-serif text-4xl font-medium leading-none text-[#3c2718]">
                  {detail.skin_age ?? "—"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Chip label="Status" value={detail.skin_status ?? "—"} />
                <Chip label="Type" value={analysis?.skinType ?? "—"} />
                <Chip
                  label="Confidence"
                  value={
                    analysis?.confidence !== undefined
                      ? `${Math.round(analysis.confidence * 100)}%`
                      : "—"
                  }
                />
              </div>
            </div>

            {analysis?.summary && (
              <p className="border-l-2 border-[#e2cba9] pl-4 leading-6 text-stone-600">
                {analysis.summary}
              </p>
            )}

            {analysis?.scores && (
              <div className="border-t border-[#f0e6da] pt-5">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#a9703e]">
                  Scores
                </p>
                <div className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                  {orderScores(analysis.scores).map(([key, value]) => (
                    <div key={key}>
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="capitalize text-stone-600">{key}</span>
                        <span className="font-mono font-semibold tabular-nums text-[#3c2718]">
                          {value}
                          <span className="text-stone-400">/100</span>
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#f3e7da]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#b9824e] to-[#d5a568]"
                          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* The model returns these too; they were being thrown away. */}
            {(analysis?.highlights?.length ||
              analysis?.concerns?.length ||
              analysis?.tips?.length) && (
              <div className="grid gap-3 border-t border-[#f0e6da] pt-5 sm:grid-cols-3">
                <StringList title="Highlights" items={analysis?.highlights} tone="good" />
                <StringList title="Concerns" items={analysis?.concerns} tone="watch" />
                <StringList title="Tips" items={analysis?.tips} tone="neutral" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* The Result card is gone, but a failed scan still has to explain itself
          and offer the re-run — kept inline so no capability was dropped with
          the card. */}
      {(detail.failure_code || detail.status === "failed") && (
        <div className="flex flex-col gap-3 rounded-xl border border-[#e8c9c9] bg-[#fdf5f4] px-4 py-3">
          {detail.failure_code && (
            <p className="text-sm text-red-700">
              Failure: {detail.failure_code}
              {detail.failure_message ? ` — ${detail.failure_message}` : ""}
            </p>
          )}
          {detail.status === "failed" && <AdminRetryButton sessionId={sessionId} />}
        </div>
      )}

      <AdminDeleteButton sessionId={sessionId} />
      </main>
    </div>
  );
}

/** Reading order used across the product, rather than whatever key order the
 *  model happened to emit. Unrecognised keys keep their position at the end. */
const SCORE_ORDER = ["hydration", "texture", "evenness", "radiance", "firmness"];

function orderScores(scores: Record<string, number>): Array<[string, number]> {
  const rank = (key: string) => {
    const i = SCORE_ORDER.indexOf(key.toLowerCase());
    return i === -1 ? SCORE_ORDER.length : i;
  };
  return Object.entries(scores).sort((a, b) => rank(a[0]) - rank(b[0]));
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#eadbca] bg-white px-3 py-1.5">
      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#a9703e]">
        {label}
      </span>
      <span className="text-sm font-medium capitalize text-[#3c2718]">{value}</span>
    </span>
  );
}

const LIST_TONES = {
  good: { panel: "border-[#d9e2d8] bg-[#f6faf5]", title: "text-[#4d6b52]", mark: "text-[#7d9a81]" },
  watch: { panel: "border-[#eedcc4] bg-[#fdf7ee]", title: "text-[#a9703e]", mark: "text-[#c08d55]" },
  neutral: { panel: "border-[#eadbca] bg-[#fdfbf8]", title: "text-[#8b735f]", mark: "text-[#b6a08c]" },
} as const;

function StringList({
  title,
  items,
  tone,
}: {
  title: string;
  items?: string[];
  tone: keyof typeof LIST_TONES;
}) {
  if (!items || items.length === 0) return null;
  const styles = LIST_TONES[tone];
  return (
    <div className={`rounded-xl border p-4 ${styles.panel}`}>
      <p className={`font-mono text-[10px] uppercase tracking-[0.18em] ${styles.title}`}>{title}</p>
      <ul className="mt-2.5 flex flex-col gap-2">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-sm leading-relaxed text-stone-600">
            <span className={styles.mark}>▸</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
