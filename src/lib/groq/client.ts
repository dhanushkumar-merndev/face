/**
 * Minimal Groq chat-completions client.
 *
 * Groq exposes an OpenAI-compatible REST endpoint, so a plain `fetch` keeps the
 * dependency surface at zero. The API key is server-only and must never be
 * exposed to the browser.
 */

const GROQ_BASE_URL = process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1";

export const DEFAULT_GROQ_VISION_MODEL = "qwen/qwen3.6-27b";

/**
 * Model cascade, tried in order. Every entry must be vision-capable: this
 * client's only caller sends image parts, and a text-only model rejects the
 * request outright with "messages[N].content must be a string" instead of
 * degrading usefully — so a text model here is a dead cascade slot, not a
 * fallback. Confirm a candidate against GET /openai/v1/models for the account
 * before adding it; a model the key cannot reach is also a dead slot.
 *
 * There is deliberately only one entry: on this account it is the sole
 * vision-capable model. Since that leaves nothing to fall back to, transient
 * failures are handled by retrying (see RETRYABLE_STATUSES) rather than by
 * moving to the next model.
 */
export const GROQ_VISION_MODELS = [DEFAULT_GROQ_VISION_MODEL];

/** Groq returns 503 over-capacity and 429 rate-limit sporadically; both pass. */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503]);
const MAX_ATTEMPTS_PER_MODEL = 2;
const RETRY_DELAY_MS = 1500;

/**
 * Completion budget. At 900 the skin read-out was cut off mid-object and Groq
 * rejected the fragment with json_validate_failed (output_tokens landed exactly
 * on the limit). The full object runs a few hundred tokens, so this leaves
 * ample headroom while staying well inside the 8000 TPM free-tier ceiling
 * alongside a ~1700-token single-image prompt.
 */
const DEFAULT_MAX_COMPLETION_TOKENS = 3000;

export function getGroqModel(): string {
  return process.env.GROQ_MODEL || DEFAULT_GROQ_VISION_MODEL;
}

/** Skin analysis is optional: without a key the scan completes without it. */
export function isGroqConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

export class GroqError extends Error {
  status?: number;
  /**
   * Groq returns the model's raw output alongside a json_validate_failed error.
   * Without it a truncated reply is indistinguishable from a malformed one, so
   * it is carried here for logging.
   */
  failedGeneration?: string;
  constructor(message: string, status?: number, failedGeneration?: string) {
    super(message);
    this.name = "GroqError";
    this.status = status;
    this.failedGeneration = failedGeneration;
  }
}

export type GroqTextPart = { type: "text"; text: string };
export type GroqImagePart = { type: "image_url"; image_url: { url: string } };
export type GroqContentPart = GroqTextPart | GroqImagePart;

export interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string | GroqContentPart[];
}

export interface GroqCompletionOptions {
  messages: GroqMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Ask Groq to constrain the reply to a JSON object. */
  jsonMode?: boolean;
  timeoutMs?: number;
}

interface GroqChoice {
  message?: { content?: string | null };
  finish_reason?: string;
}

interface GroqResponseBody {
  model?: string;
  choices?: GroqChoice[];
  error?: { message?: string; code?: string; failed_generation?: string };
}

export interface GroqCompletion {
  content: string;
  model: string;
}

export async function groqChatCompletion(
  options: GroqCompletionOptions
): Promise<GroqCompletion> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new GroqError("GROQ_API_KEY is not configured.");

  // A configured GROQ_MODEL leads the cascade; the rest still act as fallbacks.
  const configured = process.env.GROQ_MODEL;
  const modelsToTry = options.model
    ? [options.model]
    : configured
      ? [configured, ...GROQ_VISION_MODELS.filter((m) => m !== configured)]
      : GROQ_VISION_MODELS;

  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_MODEL; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);

      try {
        const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: options.messages,
            temperature: options.temperature ?? 0.2,
            max_completion_tokens: options.maxTokens ?? DEFAULT_MAX_COMPLETION_TOKENS,
            // Qwen3 reasons before answering, and those tokens come out of the
            // same completion budget as the answer. Left on, it spends the
            // budget thinking and the JSON is cut off mid-object.
            reasoning_effort: "none",
            ...(options.jsonMode ? { response_format: { type: "json_object" } } : {}),
          }),
          signal: controller.signal,
        });

        let body: GroqResponseBody;
        try {
          body = (await res.json()) as GroqResponseBody;
        } catch {
          throw new GroqError(`Groq returned a non-JSON response (${res.status}).`, res.status);
        }

        if (!res.ok) {
          throw new GroqError(
            body.error?.message ?? `Groq request failed (${res.status}).`,
            res.status,
            body.error?.failed_generation
          );
        }

        const content = body.choices?.[0]?.message?.content;
        if (!content) throw new GroqError("Groq returned an empty completion.");

        // A truncated reply is valid JSON only by luck; surface it as an error
        // rather than letting a half-object reach the schema parser.
        if (body.choices?.[0]?.finish_reason === "length") {
          throw new GroqError(
            `Groq truncated the reply at the ${options.maxTokens ?? DEFAULT_MAX_COMPLETION_TOKENS}-token completion limit.`,
            res.status,
            content
          );
        }

        return { content, model: body.model ?? model };
      } catch (err) {
        lastError = err as Error;
        const status = err instanceof GroqError ? err.status : undefined;
        const retryable = status !== undefined && RETRYABLE_STATUSES.has(status);
        const canRetry = retryable && attempt < MAX_ATTEMPTS_PER_MODEL;

        console.warn(
          `Groq model "${model}" attempt ${attempt}/${MAX_ATTEMPTS_PER_MODEL} failed` +
            `${canRetry ? ", retrying" : ""}: ${(err as Error).message}`
        );

        if (!canRetry) break;
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  throw lastError instanceof GroqError
    ? lastError
    : new GroqError(lastError?.message || "Every Groq model attempt failed.");
}
