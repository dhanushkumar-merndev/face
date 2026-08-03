import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Admin — Consent Settings" };

export default async function AdminConsentPage() {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-bold">Consent settings</h1>
      <Card>
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
  );
}
