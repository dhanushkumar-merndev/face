import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Admin — Retention Settings" };

export default async function AdminRetentionPage() {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-bold">Retention settings</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Default retention</CardTitle>
          <CardDescription>
            Media and metadata are automatically deleted after this period. Configured via the
            SCAN_RETENTION_DAYS environment variable; S3 lifecycle rules enforce it as a safety
            layer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold">{process.env.SCAN_RETENTION_DAYS ?? 30} days</p>
        </CardContent>
      </Card>
    </main>
  );
}
