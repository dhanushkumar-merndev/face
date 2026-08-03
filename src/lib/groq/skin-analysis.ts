import { z } from "zod";
import { groqChatCompletion, getGroqModel, isGroqConfigured, GroqError } from "./client";
import { getObjectBytes } from "@/lib/aws/s3";

/**
 * Skin read-out produced by a Groq vision model from the captured frames.
 *
 * This is a cosmetic/wellness estimate for entertainment — it is explicitly not
 * a medical assessment, not a diagnosis, and not proof of anyone's real age.
 */

const SCORE = z.number().min(0).max(100);

export const skinAnalysisSchema = z.object({
  skinAge: z.number().min(5).max(100),
  confidence: z.number().min(0).max(1),
  skinType: z.enum(["dry", "oily", "combination", "normal", "sensitive", "unknown"]),
  scores: z.object({
    hydration: SCORE,
    texture: SCORE,
    evenness: SCORE,
    radiance: SCORE,
    firmness: SCORE,
  }),
  concerns: z.array(z.string().min(1).max(80)).max(6),
  highlights: z.array(z.string().min(1).max(80)).max(4),
  tips: z.array(z.string().min(1).max(160)).max(5),
  summary: z.string().min(1).max(400),
});

export type SkinAnalysis = z.infer<typeof skinAnalysisSchema>;

export interface SkinAnalysisResult extends SkinAnalysis {
  provider: "groq";
  model: string;
}

export class SkinAnalysisError extends Error {
  code: "not_configured" | "no_image" | "provider_error" | "invalid_output";
  constructor(code: SkinAnalysisError["code"], message: string) {
    super(message);
    this.name = "SkinAnalysisError";
    this.code = code;
  }
}

/**
 * Only the frontal view is sent. Three base64 frames put the request at 8563
 * tokens against a free-tier ceiling of 8000 TPM, so every attempt in the model
 * cascade failed with "Request too large" and the scan lost its skin score
 * entirely. The side profiles add little skin detail the CENTER view does not
 * already carry, so dropping them is the cheapest way back under the limit.
 *
 * Raise MAX_FRAMES if the account moves to a higher tier.
 */
const MAX_FRAMES = 1;
/** Per-frame ceiling; a frame larger than this is skipped, not truncated. */
const MAX_IMAGE_BYTES = 900 * 1024;

const SYSTEM_PROMPT = `You are the scoring engine for "Find Your Skin Age", a light-hearted skincare app.

You look at selfie frames of one consenting adult and return a playful cosmetic
skin read-out. Follow these rules exactly:

- Judge visible skin appearance only: texture, fine lines, evenness of tone,
  hydration cues, radiance and firmness.
- "skinAge" is how old the SKIN LOOKS in years. It is a cosmetic impression,
  not the person's real age, and not a medical or diagnostic statement.
- Never identify, name or speculate about who the person is. Never guess
  ethnicity, gender, health conditions, medications or medical diagnoses.
- Never name a disease. Describe only what is visible in everyday cosmetic
  terms (for example "some dryness around the cheeks", "even tone").
- Keep every string short, warm, specific and encouraging. No shaming.
- "tips" are gentle general skincare habits (sunscreen, hydration, sleep).
  Never recommend prescription treatments or procedures.
- Scores are 0-100 where 100 is the best possible appearance.
- "confidence" reflects image quality and how much of the face is visible.

Reply with a single JSON object and nothing else, matching this shape:
{
  "skinAge": number,
  "confidence": number between 0 and 1,
  "skinType": "dry" | "oily" | "combination" | "normal" | "sensitive" | "unknown",
  "scores": { "hydration": number, "texture": number, "evenness": number, "radiance": number, "firmness": number },
  "concerns": string[],
  "highlights": string[],
  "tips": string[],
  "summary": string
}`;

export interface SkinAnalysisInput {
  /** Captured frames keyed by direction; CENTER is the primary view. */
  frames: Array<{ step: string; objectKey: string }>;
  /** Signals from the capture pipeline that help calibrate confidence. */
  context?: {
    ageLow?: number;
    ageHigh?: number;
    brightness?: number;
    sharpness?: number;
  };
}

function toDataUrl(bytes: Uint8Array): string {
  return `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`;
}

/**
 * Runs the vision pass over the captured frames and returns a validated
 * read-out. Throws SkinAnalysisError; callers treat failure as non-fatal.
 */
export async function analyzeSkin(input: SkinAnalysisInput): Promise<SkinAnalysisResult> {
  if (!isGroqConfigured()) {
    throw new SkinAnalysisError("not_configured", "GROQ_API_KEY is not configured.");
  }

  // Frontal view first — it carries the most usable skin detail.
  const ordered = [...input.frames].sort((a, b) =>
    a.step === "CENTER" ? -1 : b.step === "CENTER" ? 1 : 0
  );

  const images: Array<{ step: string; dataUrl: string }> = [];
  for (const frame of ordered) {
    if (images.length >= MAX_FRAMES) break;
    try {
      const bytes = await getObjectBytes(frame.objectKey);
      if (bytes.byteLength > MAX_IMAGE_BYTES) continue;
      images.push({ step: frame.step, dataUrl: toDataUrl(bytes) });
    } catch {
      // Try the next view; one usable frame is enough.
    }
  }

  if (images.length === 0) {
    throw new SkinAnalysisError("no_image", "No captured frame could be read for analysis.");
  }

  const context = input.context ?? {};
  const contextLines = [
    `Views provided: ${images.map((i) => i.step).join(", ")}.`,
    context.ageLow !== undefined && context.ageHigh !== undefined
      ? `An unrelated face-detection service estimated an age band of ${context.ageLow}-${context.ageHigh}. Treat it as weak background context only; judge the skin on what you can see.`
      : null,
    context.brightness !== undefined
      ? `Capture brightness (0-1): ${context.brightness.toFixed(2)}.`
      : null,
    context.sharpness !== undefined
      ? `Capture sharpness (0-1): ${context.sharpness.toFixed(2)}.`
      : null,
    "Return the JSON object now.",
  ].filter(Boolean) as string[];

  const completion = await groqChatCompletion({
    jsonMode: true,
    temperature: 0.3,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          ...images.map((image) => ({
            type: "image_url" as const,
            image_url: { url: image.dataUrl },
          })),
          { type: "text" as const, text: contextLines.join("\n") },
        ],
      },
    ],
  }).catch((err) => {
    if (err instanceof GroqError) {
      // The raw generation is the only way to tell a truncated reply from a
      // malformed one; without it the failure is invisible outside Groq's
      // own dashboard.
      const tail = err.failedGeneration
        ? ` | model output: ${err.failedGeneration.slice(0, 300)}`
        : "";
      throw new SkinAnalysisError("provider_error", `${err.message}${tail}`);
    }
    throw new SkinAnalysisError("provider_error", "The skin analysis provider failed.");
  });

  let raw: unknown;
  try {
    raw = JSON.parse(extractJsonObject(completion.content));
  } catch {
    throw new SkinAnalysisError("invalid_output", "The model did not return valid JSON.");
  }

  const parsed = skinAnalysisSchema.safeParse(raw);
  if (!parsed.success) {
    throw new SkinAnalysisError(
      "invalid_output",
      "The model output did not match the expected shape."
    );
  }

  return {
    ...parsed.data,
    skinAge: Math.round(parsed.data.skinAge),
    provider: "groq",
    model: completion.model || getGroqModel(),
  };
}

/**
 * JSON mode normally returns a bare object, but models occasionally wrap it in
 * prose or a code fence. Pull out the outermost object before parsing.
 */
export function extractJsonObject(text: string): string {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return trimmed;
  return trimmed.slice(start, end + 1);
}
