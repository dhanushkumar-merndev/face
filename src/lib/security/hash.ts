import { createHash } from "node:crypto";

/** SHA-256 hex digest of an arbitrary string (e.g. consent text, IP hashes). */
export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
