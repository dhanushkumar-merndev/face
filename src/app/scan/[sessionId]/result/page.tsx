"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { scanApi, type ScanStatusResult } from "@/lib/scan/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ScanResultPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const router = useRouter();
  const [result, setResult] = useState<ScanStatusResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await scanApi.status(sessionId);
      if (!res.success) {
        setError(res.error.message);
        return;
      }
      setResult(res.data);
    } catch (err) {
      console.error(err);
      setError("Could not load the scan result.");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    // Kick off the initial load via a microtask to avoid cascading renders.
    const id = setInterval(() => void load(), 4000);
    const t = setTimeout(() => void load(), 0);
    return () => {
      clearInterval(id);
      clearTimeout(t);
    };
  }, [load]);

  const handleDelete = async () => {
    if (!confirm("Delete this scan and all associated data? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await scanApi.deleteScan(sessionId);
      if (!res.success) {
        setError(res.error.message);
        setDeleting(false);
        return;
      }
      setDeleted(true);
    } catch (err) {
      console.error(err);
      setError("Deletion failed. Please try again.");
      setDeleting(false);
    }
  };

  if (deleted) {
    return (
      <main className="flex min-h-[80vh] flex-col items-center justify-center gap-4 px-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 p-6 text-center">
            <p className="text-xl font-semibold">Your data has been deleted</p>
            <p className="text-sm text-muted-foreground">
              The video, image and database record for this scan have been removed.
            </p>
            <Button onClick={() => router.push("/")}>Back to home</Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-[80vh] items-center justify-center">
        <p className="text-muted-foreground">Loading result…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-[80vh] flex-col items-center justify-center gap-4 px-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col gap-4 p-6">
            <p className="font-medium text-red-600">{error}</p>
            <Button onClick={() => router.push("/scan/capture")}>Start a new scan</Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const ageRange = result?.ageRange;

  return (
    <main className="flex min-h-[80vh] flex-col items-center justify-center gap-4 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            {result?.status === "completed" && ageRange
              ? `Estimated age range: ${ageRange.low}–${ageRange.high} years`
              : result?.status === "failed"
                ? "Scan could not be completed"
                : "Scan in progress…"}
          </CardTitle>
          <CardDescription>
            {result?.status === "completed" ? (
              <>Completed {result.completedAt ? new Date(result.completedAt).toLocaleString() : "recently"}</>
            ) : result?.status === "failed" ? (
              <>We could not produce an age estimate. No result has been saved.</>
            ) : (
              <>Your recording is being analyzed. This usually takes a few seconds.</>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          {result?.status === "completed" && (
            <p className="rounded-md bg-amber-50 p-3 text-amber-800">
              The age estimate is approximate and may be inaccurate. It is not proof of age and
              should not be used for legal, alcohol, gambling, employment, insurance, credit,
              policing or access-control decisions.
            </p>
          )}
          <div className="flex flex-col gap-2">
            <Button onClick={() => router.push("/scan/capture")}>Scan again</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete my data"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
