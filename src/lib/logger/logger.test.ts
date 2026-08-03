import { describe, it, expect, vi, afterEach } from "vitest";
import { logger } from "./index";

function captureError(fn: () => void): Record<string, unknown> {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  fn();
  const line = spy.mock.calls[0][0] as string;
  return JSON.parse(line);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logger redaction", () => {
  it("keeps the detail that makes a log useful", () => {
    const out = captureError(() =>
      logger.error("complete_assets_failed", {
        sessionId: "17df5097-1b01-4398-8d42-3629789c237f",
        error: "column \"step\" does not exist",
      })
    );

    expect(out.level).toBe("error");
    expect(out.event).toBe("complete_assets_failed");
    expect(out.sessionId).toBe("17df5097-1b01-4398-8d42-3629789c237f");
    expect(out.error).toBe('column "step" does not exist');
  });

  it("masks sensitive keys", () => {
    const out = captureError(() =>
      logger.error("request_failed", {
        authorization: "Bearer abc123",
        cookie: "sid=xyz",
        apikey: "sk-live-1",
        status: 500,
      })
    );

    expect(out.authorization).toBe("[REDACTED]");
    expect(out.cookie).toBe("[REDACTED]");
    expect(out.apikey).toBe("[REDACTED]");
    expect(out.status).toBe(500);
  });

  it("masks sensitive keys nested in objects and arrays", () => {
    const out = captureError(() =>
      logger.error("upstream_failed", {
        attempts: [{ Authorization: "Bearer abc", url: "/api/scans" }],
        headers: { cookie: "sid=xyz", host: "example.com" },
      })
    );

    expect(out.attempts).toEqual([{ Authorization: "[REDACTED]", url: "/api/scans" }]);
    expect(out.headers).toEqual({ cookie: "[REDACTED]", host: "example.com" });
  });
});
