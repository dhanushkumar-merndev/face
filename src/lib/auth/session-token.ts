import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SCAN_SESSION_COOKIE = "face_scan_session";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days; superseded by retention

/**
 * Raw session token bound to a scan session. Stored as an HttpOnly cookie;
 * only a SHA-256 hash of the token is persisted server-side.
 */
export type ScanSessionToken = {
  sessionId: string;
  token: string;
};

function cookieSecret(): string {
  const secret = process.env.SCAN_SESSION_COOKIE_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SCAN_SESSION_COOKIE_SECRET must be set to a value of at least 32 characters.");
  }
  return secret;
}

/** SHA-256 hash of the raw token, stored in the DB for lookup. */
export function hashSessionToken(rawToken: string): string {
  return createHmac("sha256", cookieSecret())
    .update(rawToken)
    .digest("hex");
}

/** Generate a fresh cryptographically random 32-byte token. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Constant-time comparison for token hashes. */
export function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export async function setScanSessionCookie(token: ScanSessionToken): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SCAN_SESSION_COOKIE, token.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

export async function getScanSessionCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SCAN_SESSION_COOKIE)?.value ?? null;
}

export async function clearScanSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SCAN_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
