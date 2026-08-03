import { sha256 } from "@/lib/security/hash";

/**
 * Minimal in-memory sliding-window rate limiter.
 * Sufficient for the MVP; swap for a distributed store when running multiple
 * instances. Keyed by a hash of the identifier so raw IPs/emails are not kept.
 */
const buckets = new Map<string, number[]>();

const WINDOW_MS = 60_000;

export type RateLimitResult = { allowed: boolean; retryAfterSeconds?: number };

export function rateLimit(key: string, limit: number, windowMs = WINDOW_MS): RateLimitResult {
  const now = Date.now();
  const hashed = sha256(key);

  const timestamps = (buckets.get(hashed) ?? []).filter((t) => now - t < windowMs);
  timestamps.push(now);
  buckets.set(hashed, timestamps);

  if (timestamps.length > limit) {
    const oldest = timestamps[0];
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    };
  }

  return { allowed: true };
}
