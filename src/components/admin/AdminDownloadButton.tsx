"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Pulls every clip and frame for one scan as a single ZIP. Fetched rather than
 * linked so a failure surfaces as a message here instead of the browser saving
 * a JSON error body to the user's downloads folder.
 */
export function AdminDownloadButton({ sessionId }: { sessionId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/scans/${sessionId}/download`);
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setError(json?.error?.message ?? "Could not prepare the download.");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `scan-${sessionId.slice(0, 8)}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setError("Could not prepare the download.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        onClick={handleDownload}
        disabled={busy}
        className="w-fit rounded-full border-[#e2cba9] bg-white text-[#7d4f29] hover:bg-[#fbf2e8] hover:text-[#3c2718]"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {busy ? "Preparing…" : "Download all media"}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
