import { redirect } from "next/navigation";

/**
 * `/admin` has no screen of its own — send it to the scan list. Unauthenticated
 * visitors get bounced on to the login page by the proxy guard.
 */
export default function AdminIndexPage() {
  redirect("/admin/scans");
}
