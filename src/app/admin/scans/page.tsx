import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin";
import { ScanTableShell } from "@/components/admin/ScanTable";

export const metadata = { title: "Admin — Scans" };

export default async function AdminScansPage() {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Scans</h1>
        <p className="text-sm text-muted-foreground">Signed in as {admin.email}</p>
      </div>
      <ScanTableShell />
    </main>
  );
}
