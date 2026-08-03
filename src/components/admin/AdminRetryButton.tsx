"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function AdminRetryButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRetry = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/scans/${sessionId}/retry-analysis`, { method: "POST" });
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message ?? "Retry failed.");
        setBusy(false);
        return;
      }
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Retry failed.");
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button variant="outline" onClick={handleRetry} disabled={busy} className="w-fit">
        {busy ? "Analyzing…" : "Retry analysis"}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
