import { describe, expect, it } from "vitest";
import { parseDetectFacesResponse, AgeAnalysisValidationError } from "@/lib/aws/rekognition";

function makeResponse(faces: Array<{ confidence?: number; low?: number; high?: number }>) {
  return {
    FaceDetails: faces.map((f) => ({
      Confidence: f.confidence,
      AgeRange: f.low !== undefined && f.high !== undefined ? { Low: f.low, High: f.high } : undefined,
      Pose: { Yaw: 1, Pitch: 2, Roll: 3 },
      Quality: { Brightness: 60, Sharpness: 80 },
    })),
  } as never;
}

describe("age-range validation", () => {
  it("parses a valid single-face result", () => {
    const result = parseDetectFacesResponse(makeResponse([{ confidence: 99.5, low: 24, high: 32 }]));
    expect(result.ageLow).toBe(24);
    expect(result.ageHigh).toBe(32);
    expect(result.faceConfidence).toBe(99.5);
    expect(result.provider).toBe("amazon-rekognition");
  });

  it("rejects zero faces", () => {
    expect(() => parseDetectFacesResponse(makeResponse([]))).toThrowError(AgeAnalysisValidationError);
  });

  it("rejects multiple faces", () => {
    expect(() =>
      parseDetectFacesResponse(makeResponse([{ confidence: 99, low: 20, high: 30 }, { confidence: 99, low: 40, high: 50 }]))
    ).toThrowError(AgeAnalysisValidationError);
  });

  it("rejects low confidence", () => {
    expect(() => parseDetectFacesResponse(makeResponse([{ confidence: 90, low: 20, high: 30 }]))).toThrowError(
      AgeAnalysisValidationError
    );
  });

  it("rejects a missing age range", () => {
    expect(() => parseDetectFacesResponse(makeResponse([{ confidence: 99.5 }]))).toThrowError(
      AgeAnalysisValidationError
    );
  });

  it("rejects invalid age bounds", () => {
    expect(() => parseDetectFacesResponse(makeResponse([{ confidence: 99.5, low: 60, high: 30 }]))).toThrowError(
      AgeAnalysisValidationError
    );
  });
});
