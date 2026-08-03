"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ScanRow = {
  id: string;
  status: string;
  createdAt: string;
  subject: string | null;
  ageRange: { low: number; high: number } | null;
  challengePassed: boolean;
  durationMs: number | null;
  retentionUntil: string | null;
};

const STATUS_BADGE: Record<string, "default" | "secondary" | "success" | "warning" | "destructive"> = {
  completed: "success",
  failed: "destructive",
  cancelled: "secondary",
  deleted: "secondary",
  deletion_requested: "warning",
  analyzing: "warning",
};

export function ScanTableShell() {
  const [scans, setScans] = useState<ScanRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (status) params.set("status", status);
      const res = await fetch(`/api/admin/scans?${params}`);
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message ?? "Could not load scans.");
        return;
      }
      setScans(json.data.scans);
      setTotal(json.data.total);
    } catch (err) {
      console.error(err);
      setError("Could not load scans.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, status]);

  useEffect(() => {
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="uploading">Uploading</SelectItem>
            <SelectItem value="analyzing">Analyzing</SelectItem>
            <SelectItem value="deleted">Deleted</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date/time</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Age range</TableHead>
              <TableHead>Challenge</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Retention</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : scans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  No scans found.
                </TableCell>
              </TableRow>
            ) : (
              scans.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{new Date(s.createdAt).toLocaleString()}</TableCell>
                  <TableCell>{s.subject ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE[s.status] ?? "secondary"}>{s.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {s.ageRange ? `${s.ageRange.low}–${s.ageRange.high}` : "—"}
                  </TableCell>
                  <TableCell>{s.challengePassed ? "✓" : "✗"}</TableCell>
                  <TableCell>
                    {s.durationMs ? `${(s.durationMs / 1000).toFixed(1)}s` : "—"}
                  </TableCell>
                  <TableCell>
                    {s.retentionUntil ? new Date(s.retentionUntil).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/admin/scans/${s.id}`}>View</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Page {page} of {totalPages} · {total} scans
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
