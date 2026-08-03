import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { PrivateVideoPlayer } from "@/components/admin/PrivateVideoPlayer";
import { AdminDeleteButton } from "@/components/admin/AdminDeleteButton";
import { AdminRetryButton } from "@/components/admin/AdminRetryButton";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Admin — Scan Detail" };

type ScanStepRow = {
  id: number;
  step: string;
  stepOrder: number;
  passed: boolean;
  hold_ms: number | null;
  representative_yaw: number | null;
  representative_pitch: number | null;
  representative_roll: number | null;
};

type ScanAssetRow = {
  id: string;
  kind: string;
  step: string | null;
  object_key: string;
  byte_size: number | null;
  mime_type: string;
};

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

type ScanAuditRow = {
  id: number;
  created_at: string;
  event_type: string;
};

type ScanDetail = {
  id: string;
  status: string;
  age_low: number | null;
  age_high: number | null;
  face_confidence: number | null;
  custom_challenge_passed: boolean;
  duration_ms: number | null;
  retention_until: string | null;
  failure_code: string | null;
  failure_message: string | null;
  skin_age: number | null;
  skin_status: string | null;
  skin_provider: string | null;
  skin_model: string | null;
  skin_analysis: SkinAnalysisRow | null;
  scan_steps: ScanStepRow[];
  scan_assets: ScanAssetRow[];
  scan_audit_events: ScanAuditRow[];
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
    .select("*, scan_steps(*), scan_assets(*), scan_audit_events(*)")
    .eq("id", sessionId)
    .single();

  if (!scan) redirect("/admin/scans");

  const detail = scan as unknown as ScanDetail;

  const statusBadge: "success" | "destructive" | "secondary" | "warning" =
    detail.status === "completed"
      ? "success"
      : detail.status === "failed"
        ? "destructive"
        : detail.status === "deleted"
          ? "secondary"
          : "warning";

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/scans" className="text-sm text-muted-foreground hover:underline">
            ← Back
          </Link>
          <h1 className="text-2xl font-bold">Scan {sessionId.slice(0, 8)}</h1>
          <Badge variant={statusBadge}>{detail.status}</Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
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
                <div className="grid grid-cols-3 gap-2">
                  {["CENTER", "LEFT", "RIGHT"].map((step) => (
                    <figure key={step} className="flex flex-col gap-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/admin/scans/${sessionId}/best-frame?step=${step}`}
                        alt={`${step} capture frame`}
                        className="aspect-square w-full rounded-lg border object-cover"
                        loading="lazy"
                      />
                      <figcaption className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        {step}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Result</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <p>
              Age range:{" "}
              <strong>
                {detail.age_low !== null && detail.age_high !== null
                  ? `${detail.age_low}–${detail.age_high}`
                  : "—"}
              </strong>
            </p>
            <p>Face confidence: {detail.face_confidence ?? "—"}</p>
            <p>Challenge passed: {detail.custom_challenge_passed ? "Yes" : "No"}</p>
            <p>Duration: {detail.duration_ms ? `${(detail.duration_ms / 1000).toFixed(1)}s` : "—"}</p>
            <p>Retention until: {detail.retention_until ? new Date(detail.retention_until).toLocaleString() : "—"}</p>
            {detail.failure_code && (
              <p className="text-red-600">
                Failure: {detail.failure_code} — {detail.failure_message}
              </p>
            )}
            {detail.status === "failed" && (
              <AdminRetryButton sessionId={sessionId} />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Skin analysis</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>
            Status: <strong>{detail.skin_status ?? "—"}</strong>
            {detail.skin_provider ? ` · ${detail.skin_provider}` : ""}
            {detail.skin_model ? ` (${detail.skin_model})` : ""}
          </p>
          <p>
            Skin age: <strong>{detail.skin_age ?? "—"}</strong>
          </p>
          {detail.skin_analysis?.summary && (
            <p className="text-muted-foreground">{detail.skin_analysis.summary}</p>
          )}
          {detail.skin_analysis?.scores && (
            <div className="flex flex-wrap gap-2 pt-1">
              {Object.entries(detail.skin_analysis.scores).map(([key, value]) => (
                <span key={key} className="rounded-md border px-2 py-1 text-xs">
                  {key}: {value}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Direction steps</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2 text-sm">
            {(detail.scan_steps ?? []).map((step) => (
              <div key={step.step} className="flex items-center justify-between rounded-md border px-3 py-2">
                <span className="font-medium">
                  {step.stepOrder}. {step.step}
                </span>
                <span className="text-muted-foreground">
                  {step.passed ? "Passed" : "Failed"} · hold {step.hold_ms}ms · yaw{" "}
                  {step.representative_yaw}° · pitch {step.representative_pitch}° · roll{" "}
                  {step.representative_roll}°
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">S3 objects</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            {(detail.scan_assets ?? []).map((asset) => (
              <p key={asset.id}>
                {asset.kind}
                {asset.step ? ` [${asset.step}]` : ""}: {asset.object_key} ({asset.byte_size} bytes,{" "}
                {asset.mime_type})
              </p>
            ))}
            {(detail.scan_assets ?? []).length === 0 && <p>No objects recorded.</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit events</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            {(detail.scan_audit_events ?? []).map((event) => (
              <p key={event.id}>
                {new Date(event.created_at).toLocaleString()} — {event.event_type}
              </p>
            ))}
            {(detail.scan_audit_events ?? []).length === 0 && <p>No events recorded.</p>}
          </div>
        </CardContent>
      </Card>

      <AdminDeleteButton sessionId={sessionId} />
    </main>
  );
}
