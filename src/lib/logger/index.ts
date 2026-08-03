const REDACT_KEYS = ["authorization", "cookie", "x-supabase-api-key", "apikey"];

/**
 * Recurses so nested objects get the same key-based treatment. Values are
 * decided by their key, never by their type: masking every string here would
 * swallow the event detail — error messages, ids, codes — that these logs
 * exist to carry, and would make REDACT_KEYS meaningless.
 */
function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    return redactObject(value as Record<string, unknown>);
  }
  return value;
}

function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = REDACT_KEYS.includes(k.toLowerCase()) ? "[REDACTED]" : redactValue(v);
  }
  return out;
}

function redact(data: Record<string, unknown> | undefined): Record<string, unknown> {
  return data ? redactObject(data) : {};
}

/**
 * Structured logger. Never log raw media, tokens, signed URLs or PII.
 * Only already-hashed identifiers should be passed in.
 */
export const logger = {
  info(event: string, data?: Record<string, unknown>) {
    console.log(JSON.stringify({ level: "info", event, ...redact(data) }));
  },
  warn(event: string, data?: Record<string, unknown>) {
    console.warn(JSON.stringify({ level: "warn", event, ...redact(data) }));
  },
  error(event: string, data?: Record<string, unknown>) {
    console.error(JSON.stringify({ level: "error", event, ...redact(data) }));
  },
};
