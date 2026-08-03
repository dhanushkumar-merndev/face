import { describe, expect, it } from "vitest";
import { sha256 } from "@/lib/security/hash";
import { rateLimit } from "@/lib/security/rate-limit";

describe("sha256", () => {
  it("produces a stable 64-char hex digest", () => {
    const a = sha256("hello");
    const b = sha256("hello");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs for different inputs", () => {
    expect(sha256("a")).not.toBe(sha256("b"));
  });
});

describe("rateLimit", () => {
  it("allows requests under the limit", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      expect(rateLimit(key, 5).allowed).toBe(true);
    }
  });

  it("blocks requests over the limit", () => {
    const key = `test-block-${Math.random()}`;
    for (let i = 0; i < 3; i++) rateLimit(key, 3);
    const r = rateLimit(key, 3);
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("treats the same identifier consistently and different identifiers independently", () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    for (let i = 0; i < 3; i++) rateLimit(a, 3);
    expect(rateLimit(a, 3).allowed).toBe(false);
    expect(rateLimit(b, 3).allowed).toBe(true);
  });
});
