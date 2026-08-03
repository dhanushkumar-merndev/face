import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Secure anonymous session token support. The raw token is stored in an
 * HttpOnly cookie; only its SHA-256 hash is stored server-side. Because the
 * hash is HMAC-keyed with the cookie secret, we can look up sessions by the
 * hashed token value (the server recomputes the same HMAC).
 */

export interface SessionTokenRow {
  session_id: string;
  token_hash: string;
  expires_at: string;
}

const SESSION_TOKEN_TABLE = "scan_session_tokens";

export async function storeSessionToken(
  sessionId: string,
  tokenHash: string,
  expiresAt: Date
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from(SESSION_TOKEN_TABLE).insert({
    session_id: sessionId,
    token_hash: tokenHash,
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw error;
}

export async function findSessionByTokenHash(
  tokenHash: string
): Promise<SessionTokenRow | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(SESSION_TOKEN_TABLE)
    .select("session_id, token_hash, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) throw error;
  return data as SessionTokenRow | null;
}

export async function deleteSessionToken(sessionId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase.from(SESSION_TOKEN_TABLE).delete().eq("session_id", sessionId);
}
