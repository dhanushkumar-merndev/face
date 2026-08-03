import type { StepResult } from "@/lib/face/types";

export type ApiSuccess<T> = { success: true; data: T };
export type ApiFailure = {
  success: false;
  error: { code: string; message: string; fieldErrors?: Record<string, string[]> };
};
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export type ChallengeSequence = ["CENTER", "LEFT", "RIGHT", "UP", "CENTER_FINAL"];

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

export interface UploadUrlsInput {
  video: { mimeType: string; byteSize: number; extension: string };
  bestFrame: { mimeType: string; byteSize: number; extension: string };
  thumbnail?: { mimeType: string; byteSize: number; extension: string } | null;
}

export interface UploadUrlsResult {
  video: { url: string; objectKey: string; headers: Record<string, string> };
  bestFrame: { url: string; objectKey: string; headers: Record<string, string> };
  thumbnail?: { url: string; objectKey: string; headers: Record<string, string> } | null;
}

export interface CompleteScanInput {
  durationMs: number;
  video: { objectKey: string; mimeType: string; byteSize: number; etag?: string };
  bestFrame: {
    objectKey: string;
    mimeType: string;
    byteSize: number;
    etag?: string;
    width: number;
    height: number;
  };
  steps: StepResult[];
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
  completedAt: string | null;
}

export interface ScanStatusResult {
  status: string;
  ageRange: { low: number; high: number } | null;
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
