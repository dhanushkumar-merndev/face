import { NextRequest } from "next/server";
import { getScanSessionCookie } from "@/lib/auth/session-token";
import { hashSessionToken } from "@/lib/auth/session-token";
import { findSessionByTokenHash } from "@/lib/auth/session-token-store";

/**
 * Resolves the session id from the HttpOnly scan cookie. Returns null when the
 * cookie is missing, the token hash is unknown, or the token has expired.
 */
export async function resolveSessionFromRequest(
  req: NextRequest,
  requestedSessionId: string
): Promise<string | null> {
  const rawToken = await getScanSessionCookie();
  if (!rawToken) return null;

  const tokenHash = hashSessionToken(rawToken);
  const row = await findSessionByTokenHash(tokenHash);
  if (!row) return null;

  if (row.session_id !== requestedSessionId) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;

  return row.session_id;
}
