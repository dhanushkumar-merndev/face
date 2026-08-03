import { NextRequest } from "next/server";
import { createSessionSchema } from "@/lib/validation/scan";
import { fromZodError, ok, fail, internalError } from "@/lib/api/respond";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { generateSessionToken, hashSessionToken, setScanSessionCookie } from "@/lib/auth/session-token";
import { storeSessionToken } from "@/lib/auth/session-token-store";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/security/rate-limit";
import { sha256 } from "@/lib/security/hash";
import { SCAN_CONFIG } from "@/lib/face/config";

const CONSENT_VERSION = process.env.SCAN_CONSENT_VERSION ?? "2026-08-v1";

export async function POST(req: NextRequest) {
  // Rate limit session creation per IP.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimit(`session:${ip}`, 10);
  if (!rl.allowed) {
    return fail("rate_limited", "Too many scan sessions. Please try again later.", 429);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("invalid_json", "Request body is not valid JSON.");
  }

  const parsed = createSessionSchema.safeParse(body);
  if (!parsed.success) return fromZodError(parsed.error);

  const { subjectName, subjectEmail, subjectPhone, consentGiven, adultDeclaration } = parsed.data;

  if (!consentGiven) {
    return fail("consent_required", "Consent is required to start a scan.");
  }
  if (!adultDeclaration) {
    return fail("adult_declaration_required", "You must confirm you are 18 or older.");
  }

  const supabase = getSupabaseAdmin();

  // Create the session.
  const retentionDays = Number(process.env.SCAN_RETENTION_DAYS ?? "30");
  const retentionUntil = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: session, error: sessionError } = await supabase
    .from("scan_sessions")
    .insert({
      status: "consented",
      consent_given: true,
      consent_version: parsed.data.consentVersion || CONSENT_VERSION,
      consent_text_hash: hashConsentText(parsed.data.consentVersion),
      consented_at: new Date().toISOString(),
      adult_declaration: true,
      subject_name: subjectName || null,
      subject_email: subjectEmail || null,
      subject_phone: subjectPhone || null,
      retention_until: retentionUntil,
    })
    .select("id")
    .single();

  if (sessionError || !session) {
    logger.error("session_create_failed", { error: sessionError?.message });
    return internalError("Could not create the scan session.");
  }

  // Secure anonymous token.
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const tokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  try {
    await storeSessionToken(session.id, tokenHash, tokenExpires);
  } catch (err) {
    logger.error("session_token_store_failed", { error: (err as Error).message });
    // Roll back the session so no orphan exists.
    await supabase.from("scan_sessions").delete().eq("id", session.id);
    return internalError("Could not secure the scan session.");
  }

  await setScanSessionCookie({ sessionId: session.id, token });

  // Audit.
  await supabase.from("scan_audit_events").insert({
    session_id: session.id,
    event_type: "session_created",
    event_data: { consentVersion: parsed.data.consentVersion || CONSENT_VERSION },
  });

  logger.info("session_created", { sessionId: session.id });

  return ok({
    sessionId: session.id,
    challenge: ["CENTER", "LEFT", "RIGHT", "UP", "CENTER_FINAL"],
    maxDurationMs: SCAN_CONFIG.maxDurationMs,
  });
}

function hashConsentText(version: string): string {
  return sha256(`consent:${version}`);
}
