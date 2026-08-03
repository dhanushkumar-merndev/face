"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Plays a private S3 video via a short-lived admin-signed GET URL.
 * The URL is fetched on demand and never persisted.
 */
export function PrivateVideoPlayer({ sessionId }: { sessionId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadUrl = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/scans/${sessionId}/playback-url`, { method: "POST" });
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message ?? "Could not load video.");
        return;
      }
      setUrl(json.data.url);
    } catch (err) {
      console.error(err);
      setError("Could not load video.");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    const id = setTimeout(() => void loadUrl(), 0);
    return () => clearTimeout(id);
  }, [loadUrl]);

  if (error) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-red-600">{error}</p>
        <Button variant="outline" size="sm" onClick={loadUrl}>
          Retry
        </Button>
      </div>
    );
  }

  if (loading || !url) {
    return <p className="text-sm text-muted-foreground">Loading video…</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {/* key forces reload when a new signed URL arrives */}
      <video key={url} src={url} controls playsInline className="w-full max-w-xl rounded-lg bg-black" />
      <p className="text-xs text-muted-foreground">Signed playback URL — expires shortly.</p>
    </div>
  );
}
