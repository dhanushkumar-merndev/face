/**
 * Seeds the admin user + admin_profiles row.
 *
 * Usage:
 *   1. Create .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 *   2. Run: pnpm seed:admin
 *
 * Creates (or idempotently updates) the user admin@gmail.com and grants the
 * admin role in admin_profiles.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Load .env.local first, then fall back to .env (keeps local overrides winning).
const envLocal = join(root, ".env.local");
if (existsSync(envLocal)) config({ path: envLocal });
config({ path: join(root, ".env") });

const ADMIN_EMAIL = "admin@gmail.com";
const ADMIN_PASSWORD = "Face@admin123";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // 1. Find existing user by email.
  const { data: existing } = await supabase
    .from("admin_profiles")
    .select("user_id, email")
    .eq("email", ADMIN_EMAIL)
    .maybeSingle();

  let userId;

  if (existing) {
    userId = existing.user_id;
    console.log(`admin_profiles row exists for ${ADMIN_EMAIL} (${userId})`);
  } else {
    // 2. Look up the auth user by email via the admin API.
    const { data: users } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    const authUser = (users?.users ?? []).find((u) => u.email?.toLowerCase() === ADMIN_EMAIL);

    if (authUser) {
      userId = authUser.id;
      console.log(`auth user found: ${ADMIN_EMAIL} (${userId})`);
    } else {
      // 3. Create the auth user.
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        email_confirm: true,
        user_metadata: { role: "admin" },
      });
      if (createError) {
        console.error("Failed to create auth user:", createError.message);
        process.exit(1);
      }
      userId = created.user.id;
      console.log(`created auth user: ${ADMIN_EMAIL} (${userId})`);
    }

    // 4. Insert the admin profile.
    const { error: insertError } = await supabase.from("admin_profiles").insert({
      user_id: userId,
      email: ADMIN_EMAIL,
      role: "admin",
    });
    if (insertError) {
      console.error("Failed to create admin profile:", insertError.message);
      process.exit(1);
    }
    console.log(`granted admin role to ${ADMIN_EMAIL}`);
  }

  console.log("Admin ready. Sign in at /admin/login with admin@gmail.com");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
