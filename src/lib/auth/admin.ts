import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type AdminSession = {
  userId: string;
  email: string;
  role: "admin" | "superadmin";
};

/**
 * Resolve the current admin from the request's auth session.
 * Requires the Supabase session AND an admin_profiles row (or a matching
 * email in the ADMIN_EMAIL_ALLOWLIST that is not yet provisioned).
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email) return null;

  // Allowlist provisioning: when the email is allowlisted but no profile row
  // exists yet, treat the user as admin (the profile is created lazily).
  const allowlist = (process.env.ADMIN_EMAIL_ALLOWLIST ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const admin = await getSupabaseAdmin()
    .from("admin_profiles")
    .select("user_id, email, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (admin.data) {
    return {
      userId: admin.data.user_id,
      email: admin.data.email,
      role: admin.data.role as "admin" | "superadmin",
    };
  }

  if (allowlist.includes(user.email.toLowerCase())) {
    return { userId: user.id, email: user.email, role: "admin" };
  }

  return null;
}

export async function requireAdminSession(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}
