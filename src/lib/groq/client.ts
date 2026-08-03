/**
 * Minimal Groq chat-completions client.
 *
 * Groq exposes an OpenAI-compatible REST endpoint, so a plain `fetch` keeps the
 * dependency surface at zero. The API key is server-only and must never be
 * exposed to the browser.
 */

const GROQ_BASE_URL = process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1";

/** Vision-capable Groq model used for the skin read-out. */
export const DEFAULT_GROQ_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

export function getGroqModel(): string {
  return process.env.GROQ_MODEL || DEFAULT_GROQ_VISION_MODEL;
}

/** Skin analysis is optional: without a key the scan completes without it. */
export function isGroqConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

export class GroqError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "GroqError";
    this.status = status;
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
  error?: { message?: string };
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

  const model = options.model ?? getGroqModel();
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
        max_completion_tokens: options.maxTokens ?? 900,
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
      throw new GroqError(body.error?.message ?? `Groq request failed (${res.status}).`, res.status);
    }

    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new GroqError("Groq returned an empty completion.");

    return { content, model: body.model ?? model };
  } catch (err) {
    if (err instanceof GroqError) throw err;
    if ((err as Error).name === "AbortError") {
      throw new GroqError("Groq request timed out.");
    }
    throw new GroqError((err as Error).message);
  } finally {
    clearTimeout(timeout);
  }
}
