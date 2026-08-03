import { z } from "zod";

export const emailSchema = z
  .string()
  .email()
  .max(320)
  .optional()
  .or(z.literal(""))
  .nullable();

export const createSessionSchema = z.object({
  subjectName: z.string().max(200).optional().nullable(),
  subjectEmail: emailSchema,
  subjectPhone: z.string().max(30).optional().nullable(),
  consentGiven: z.literal(true, { error: "Consent is required to start a scan." }),
  adultDeclaration: z.literal(true, { error: "You must confirm you are 18 or older." }),
  consentVersion: z.string().min(1).max(100),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export const challengeStepSchema = z.enum(["CENTER", "LEFT", "RIGHT"]);

const assetUploadSchema = z.object({
  mimeType: z.string().min(3).max(100),
  byteSize: z.number().int().min(1),
  extension: z.string().min(1).max(10),
});

/** One direction's requested upload slots: its video segment and its frame. */
const captureUploadSchema = z.object({
  step: challengeStepSchema,
  video: assetUploadSchema,
  frame: assetUploadSchema,
});

export const uploadUrlsSchema = z.object({
  captures: z.array(captureUploadSchema).min(1).max(3),
});

export type UploadUrlsInput = z.infer<typeof uploadUrlsSchema>;

const videoObjectSchema = z.object({
  objectKey: z.string().min(1).max(500),
  mimeType: z.string().min(3).max(100),
  byteSize: z.number().int().min(1),
  etag: z.string().optional().nullable(),
  durationMs: z.number().int().min(0).max(60000).optional(),
});

const frameObjectSchema = z.object({
  objectKey: z.string().min(1).max(500),
  mimeType: z.string().min(3).max(100),
  byteSize: z.number().int().min(1),
  etag: z.string().optional().nullable(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

/** One direction's uploaded pair, confirmed by the client after PUT. */
const captureObjectSchema = z.object({
  step: challengeStepSchema,
  video: videoObjectSchema,
  frame: frameObjectSchema,
});

const stepSchema = z.object({
  step: challengeStepSchema,
  stepOrder: z.number().int().min(1).max(3),
  passed: z.boolean(),
  holdMs: z.number().int().min(0),
  yaw: z.number(),
  pitch: z.number(),
  roll: z.number(),
  frameTimestampMs: z.number().int().min(0),
});

export const qualitySummarySchema = z.object({
  minimumFaceCount: z.number().int().min(0),
  maximumFaceCount: z.number().int().min(0),
  averageBrightness: z.number().min(0).max(1),
  bestSharpness: z.number().min(0).max(1),
});

export const completeScanSchema = z.object({
  durationMs: z.number().int().min(0).max(60000),
  captures: z.array(captureObjectSchema).length(3),
  /** Which direction's frame is used for age/skin analysis. Must be frontal. */
  analysisStep: challengeStepSchema.default("CENTER"),
  steps: z.array(stepSchema),
  qualitySummary: qualitySummarySchema,
});

export type CompleteScanInput = z.infer<typeof completeScanSchema>;

/** The exact allowed challenge sequence. Anything else is rejected. */
export const REQUIRED_CHALLENGE_SEQUENCE = ["CENTER", "LEFT", "RIGHT"] as const;

/** Every direction must have contributed exactly one video + frame pair. */
export function hasCaptureForEveryStep(captures: { step: string }[]): boolean {
  const seen = new Set(captures.map((c) => c.step));
  return (
    seen.size === captures.length &&
    seen.size === REQUIRED_CHALLENGE_SEQUENCE.length &&
    REQUIRED_CHALLENGE_SEQUENCE.every((s) => seen.has(s))
  );
}

export function isRequiredSequence(steps: { step: string; stepOrder: number; passed: boolean }[]): boolean {
  if (steps.length !== REQUIRED_CHALLENGE_SEQUENCE.length) return false;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (s.step !== REQUIRED_CHALLENGE_SEQUENCE[i]) return false;
    if (s.stepOrder !== i + 1) return false;
    if (!s.passed) return false;
  }
  return true;
}
