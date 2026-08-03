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

const assetUploadSchema = z.object({
  mimeType: z.string().min(3).max(100),
  byteSize: z.number().int().min(1),
  extension: z.string().min(1).max(10),
});

export const uploadUrlsSchema = z.object({
  video: assetUploadSchema,
  bestFrame: assetUploadSchema,
  thumbnail: assetUploadSchema.nullable().optional(),
});

export type UploadUrlsInput = z.infer<typeof uploadUrlsSchema>;

const videoObjectSchema = z.object({
  objectKey: z.string().min(1).max(500),
  mimeType: z.string().min(3).max(100),
  byteSize: z.number().int().min(1),
  etag: z.string().optional().nullable(),
});

const bestFrameObjectSchema = videoObjectSchema.extend({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const stepSchema = z.object({
  step: z.enum(["CENTER", "LEFT", "RIGHT", "UP", "CENTER_FINAL"]),
  stepOrder: z.number().int().min(1).max(5),
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
  video: videoObjectSchema,
  bestFrame: bestFrameObjectSchema,
  steps: z.array(stepSchema),
  qualitySummary: qualitySummarySchema,
});

export type CompleteScanInput = z.infer<typeof completeScanSchema>;

/** The exact allowed challenge sequence. Anything else (incl. DOWN) is rejected. */
export const REQUIRED_CHALLENGE_SEQUENCE = ["CENTER", "LEFT", "RIGHT", "UP", "CENTER_FINAL"] as const;

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
