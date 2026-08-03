"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function AdminDeleteButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!confirm("Permanently delete this scan, its video, image and database record?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/scans/${sessionId}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message ?? "Deletion failed.");
        setBusy(false);
        return;
      }
      router.push("/admin/scans");
    } catch (err) {
      console.error(err);
      setError("Deletion failed.");
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button variant="destructive" onClick={handleDelete} disabled={busy} className="w-fit">
        {busy ? "Deleting…" : "Delete scan"}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
