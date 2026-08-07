import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin";
import { ScanTableShell } from "@/components/admin/ScanTable";
import { AdminTopbar } from "@/components/admin/AdminTopbar";

export const metadata = { title: "Admin — Scans" };

export default async function AdminScansPage() {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");
  return (
    <div className="min-h-dvh bg-[#fcfaf7]">
      <AdminTopbar />
      <main className="mx-auto flex max-w-7xl flex-col gap-7 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <div className="max-w-2xl">
          <p className="admin-eyebrow">Review centre</p>
          <h1 className="admin-heading mt-2">Scan records</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">Review completed scans, check captures, and manage data retention from one place.</p>
        </div>
        <ScanTableShell />
      </main>
    </div>
  );
}
