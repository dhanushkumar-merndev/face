import type { ChallengeStep } from "@/lib/face/types";

export type ApiSuccess<T> = { success: true; data: T };
export type ApiFailure = {
  success: false;
  error: { code: string; message: string; fieldErrors?: Record<string, string[]> };
};
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export type ChallengeSequence = ["CENTER", "LEFT", "RIGHT"];

/** Skin read-out returned by the Groq vision pass. */
export interface SkinAnalysisPayload {
  skinAge: number;
  confidence: number;
  skinType: "dry" | "oily" | "combination" | "normal" | "sensitive" | "unknown";
  scores: {
    hydration: number;
    texture: number;
    evenness: number;
    radiance: number;
    firmness: number;
  };
  concerns: string[];
  highlights: string[];
  tips: string[];
  summary: string;
  provider?: string;
  model?: string;
}

export type SkinStatus = "pending" | "completed" | "failed" | "skipped";

export interface CreateSessionInput {
  subjectName?: string;
  subjectEmail?: string;
  subjectPhone?: string;
  consentGiven: boolean;
  adultDeclaration: boolean;
  consentVersion: string;
}

export interface CreateSessionResult {
  sessionId: string;
  challenge: ChallengeSequence;
  maxDurationMs: number;
}

export interface AssetUploadRequest {
  mimeType: string;
  byteSize: number;
  extension: string;
}

/** Upload slots requested for one direction. */
export interface CaptureUploadRequest {
  step: ChallengeStep;
  video: AssetUploadRequest;
  frame: AssetUploadRequest;
}

export interface UploadUrlsInput {
  captures: CaptureUploadRequest[];
}

export interface PresignedSlot {
  url: string;
  objectKey: string;
  headers: Record<string, string>;
}

export interface UploadUrlsResult {
  captures: Array<{ step: ChallengeStep; video: PresignedSlot; frame: PresignedSlot }>;
}

/** One direction's uploaded pair, confirmed back to the server. */
export interface CaptureCompleteInput {
  step: ChallengeStep;
  video: {
    objectKey: string;
    mimeType: string;
    byteSize: number;
    etag?: string;
    durationMs?: number;
  };
  frame: {
    objectKey: string;
    mimeType: string;
    byteSize: number;
    etag?: string;
    width: number;
    height: number;
  };
}

/**
 * Wire shape for a completed direction. Note the flattened pose keys — the
 * in-memory `StepResult` names them `representativeYaw` etc.
 */
export interface StepResultPayload {
  step: ChallengeStep;
  stepOrder: number;
  passed: boolean;
  holdMs: number;
  yaw: number;
  pitch: number;
  roll: number;
  frameTimestampMs: number;
}

export interface CompleteScanInput {
  durationMs: number;
  captures: CaptureCompleteInput[];
  analysisStep: ChallengeStep;
  steps: StepResultPayload[];
  qualitySummary: {
    minimumFaceCount: number;
    maximumFaceCount: number;
    averageBrightness: number;
    bestSharpness: number;
  };
}

export interface CompleteScanResult {
  sessionId: string;
  status: string;
  ageRange: { low: number; high: number } | null;
  skin: SkinAnalysisPayload | null;
  completedAt: string | null;
}

export interface ScanStatusResult {
  status: string;
  ageRange: { low: number; high: number } | null;
  skinStatus: SkinStatus;
  skinAge: number | null;
  skin: SkinAnalysisPayload | null;
  completedAt: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
}

async function request<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = (await res.json()) as ApiResult<T>;
  return json;
}

export const scanApi = {
  createSession(input: CreateSessionInput): Promise<ApiResult<CreateSessionResult>> {
    return request<CreateSessionResult>("/api/scans/session", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  recordingStarted(sessionId: string): Promise<ApiResult<{ sessionId: string }>> {
    return request<{ sessionId: string }>(`/api/scans/${sessionId}/recording-started`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  uploadUrls(sessionId: string, input: UploadUrlsInput): Promise<ApiResult<UploadUrlsResult>> {
    return request<UploadUrlsResult>(`/api/scans/${sessionId}/upload-urls`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  complete(sessionId: string, input: CompleteScanInput): Promise<ApiResult<CompleteScanResult>> {
    return request<CompleteScanResult>(`/api/scans/${sessionId}/complete`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  status(sessionId: string): Promise<ApiResult<ScanStatusResult>> {
    return request<ScanStatusResult>(`/api/scans/${sessionId}/status`, { method: "GET" });
  },

  deleteScan(sessionId: string): Promise<ApiResult<{ deleted: boolean }>> {
    return request<{ deleted: boolean }>(`/api/scans/${sessionId}/delete`, {
      method: "DELETE",
    });
  },
};
