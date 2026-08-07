"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Eye, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

const formatDate = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const formatAge = (age: ScanRow["ageRange"]) => (age ? `${age.low}–${age.high}` : "—");
const formatDuration = (duration: number | null) => (duration ? `${(duration / 1000).toFixed(1)}s` : "—");

export function ScanTableShell() {
  const [scans, setScans] = useState<ScanRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (status !== "all") params.set("status", status);
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
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="admin-card overflow-hidden" aria-labelledby="scan-list-title">
      <div className="flex flex-col gap-4 border-b border-stone-200 px-4 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div>
          <h2 id="scan-list-title" className="font-serif text-2xl font-semibold text-[#3c2718]">All scans</h2>
          <p className="mt-1 text-sm text-stone-500">{total} record{total === 1 ? "" : "s"} {status === "all" ? "available" : `with status “${status}”`}</p>
        </div>
        <div className="flex flex-col gap-2 xs:flex-row sm:items-center">
          <Select value={status} onValueChange={(value) => { setStatus(value); setPage(1); }}>
            <SelectTrigger className="w-full border-stone-300 bg-white xs:w-48">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Needs review</SelectItem>
              <SelectItem value="uploading">Uploading</SelectItem>
              <SelectItem value="analyzing">Analyzing</SelectItem>
              <SelectItem value="deleted">Deleted</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="border-[#decbb8] bg-white text-stone-700 hover:bg-[#fbf2e8]">
            <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>
      </div>

      {error && <p className="mx-4 mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:mx-6" role="alert">{error}</p>}

      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader className="bg-[#f8f4ed]">
            <TableRow className="hover:bg-transparent">
              <TableHead>Date & time</TableHead><TableHead>Subject</TableHead><TableHead>Status</TableHead><TableHead>Age range</TableHead><TableHead>Challenge</TableHead><TableHead>Duration</TableHead><TableHead>Retention</TableHead><TableHead className="text-right">Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? <LoadingRow /> : scans.length === 0 ? <EmptyRow /> : scans.map((scan) => <DesktopRow key={scan.id} scan={scan} />)}
          </TableBody>
        </Table>
      </div>

      <div className="divide-y divide-stone-200 md:hidden" aria-live="polite">
        {loading ? <p className="p-5 text-sm text-stone-500">Loading records…</p> : scans.length === 0 ? <p className="p-5 text-sm text-stone-500">No scans found for this filter.</p> : scans.map((scan) => <MobileRow key={scan.id} scan={scan} />)}
      </div>

      <div className="flex flex-col gap-3 border-t border-stone-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-sm text-stone-500">Page {page} of {totalPages}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)} className="border-stone-300 bg-white"><ChevronLeft /> Previous</Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((current) => current + 1)} className="border-stone-300 bg-white">Next <ChevronRight /></Button>
        </div>
      </div>
    </section>
  );
}

function LoadingRow() {
  return <TableRow><TableCell colSpan={8} className="h-28 text-center text-stone-500">Loading records…</TableCell></TableRow>;
}
function EmptyRow() {
  return <TableRow><TableCell colSpan={8} className="h-28 text-center text-stone-500">No scans found for this filter.</TableCell></TableRow>;
}
function DesktopRow({ scan }: { scan: ScanRow }) {
  return <TableRow className="border-stone-100 hover:bg-[#fdfaf5]">
    <TableCell className="whitespace-nowrap text-stone-700">{formatDate(scan.createdAt)}</TableCell>
    <TableCell className="max-w-44 truncate text-stone-700">{scan.subject ?? "—"}</TableCell>
    <TableCell><StatusBadge status={scan.status} /></TableCell>
    <TableCell className="font-medium text-[#3c2718]">{formatAge(scan.ageRange)}</TableCell>
    <TableCell className={scan.challengePassed ? "text-emerald-700" : "text-stone-500"}>{scan.challengePassed ? "Passed" : "—"}</TableCell>
    <TableCell className="text-stone-600">{formatDuration(scan.durationMs)}</TableCell>
    <TableCell className="text-stone-600">{scan.retentionUntil ? new Date(scan.retentionUntil).toLocaleDateString() : "—"}</TableCell>
    <TableCell className="text-right"><RecordLink scan={scan} /></TableCell>
  </TableRow>;
}
function MobileRow({ scan }: { scan: ScanRow }) {
  return <article className="flex items-start justify-between gap-3 p-4">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2"><StatusBadge status={scan.status} /><span className="text-xs text-stone-500">{formatDate(scan.createdAt)}</span></div>
      <p className="mt-2 truncate font-medium text-[#3c2718]">{scan.subject ?? "Anonymous scan"}</p>
      <p className="mt-1 text-sm text-stone-600">Age range <span className="font-medium text-[#3c2718]">{formatAge(scan.ageRange)}</span> · {formatDuration(scan.durationMs)}</p>
    </div>
    <RecordLink scan={scan} iconOnly />
  </article>;
}
function StatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS_BADGE[status] ?? "secondary"} className="capitalize">{status.replaceAll("_", " ")}</Badge>;
}
function RecordLink({ scan, iconOnly = false }: { scan: ScanRow; iconOnly?: boolean }) {
  return <Button asChild variant="outline" size="sm" className="shrink-0 border-[#decbb8] bg-white text-stone-700 hover:bg-[#fbf2e8]"><Link href={`/admin/scans/${scan.id}`} aria-label={`Open scan ${scan.id.slice(0, 8)}`}><Eye />{!iconOnly && "View"}</Link></Button>;
}
