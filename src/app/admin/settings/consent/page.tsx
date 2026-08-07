import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminTopbar } from "@/components/admin/AdminTopbar";

export const metadata = { title: "Admin — Consent Settings" };

export default async function AdminConsentPage() {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");

  return (
    <div className="min-h-dvh bg-[#fcfaf7]">
      <AdminTopbar />
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6 lg:py-10">
        <div>
          <p className="admin-eyebrow">Privacy controls</p>
          <h1 className="admin-heading mt-2">Consent settings</h1>
        </div>
        <Card className="admin-card">
        <CardHeader>
          <CardTitle className="text-base">Consent version</CardTitle>
          <CardDescription>
            The active consent text version is recorded against every scan. Configured via the
            SCAN_CONSENT_VERSION environment variable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold">{process.env.SCAN_CONSENT_VERSION ?? "2026-08-v1"}</p>
        </CardContent>
        </Card>
      </main>
    </div>
  );
}
