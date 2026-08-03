"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface Clip {
  step: string;
  url: string;
}

/**
 * Plays the private per-direction clips via short-lived admin-signed GET URLs.
 * URLs are fetched on demand and never persisted.
 */
export function PrivateVideoPlayer({ sessionId }: { sessionId: string }) {
  const [clips, setClips] = useState<Clip[] | null>(null);
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
      const loaded: Clip[] = json.data.clips ?? (json.data.url ? [{ step: "CENTER", url: json.data.url }] : []);
      setClips(loaded);
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

  if (loading || !clips) {
    return <p className="text-sm text-muted-foreground">Loading clips…</p>;
  }

  if (clips.length === 0) {
    return <p className="text-sm text-muted-foreground">No clips recorded.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {clips.map((clip) => (
        <div key={clip.step} className="flex flex-col gap-1.5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {clip.step}
          </p>
          {/* key forces reload when a new signed URL arrives */}
          <video
            key={clip.url}
            src={clip.url}
            controls
            playsInline
            className="w-full max-w-xl rounded-lg bg-black"
          />
        </div>
      ))}
      <p className="text-xs text-muted-foreground">Signed playback URLs — expire shortly.</p>
    </div>
  );
}
