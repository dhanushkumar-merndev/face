import {
  RekognitionClient,
  DetectFacesCommand,
  type DetectFacesCommandOutput,
} from "@aws-sdk/client-rekognition";
import { getBucket, getObjectBytes } from "@/lib/aws/s3";

let rekognitionClient: RekognitionClient | null = null;

function getRekognitionClient(): RekognitionClient {
  if (!rekognitionClient) {
    rekognitionClient = new RekognitionClient({
      region: process.env.AWS_REGION ?? "ap-south-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
      },
    });
  }
  return rekognitionClient;
}

export type AgeAnalysis = {
  ageLow: number;
  ageHigh: number;
  faceConfidence: number;
  pose: {
    yaw: number;
    pitch: number;
    roll: number;
  };
  quality: {
    brightness: number;
    sharpness: number;
  };
  provider: "amazon-rekognition";
  modelVersion: string;
};

export type AgeAnalysisError = {
  code:
    | "NO_FACE"
    | "MULTIPLE_FACES"
    | "LOW_CONFIDENCE"
    | "MISSING_AGE_RANGE"
    | "INVALID_AGE_RANGE";
  message: string;
};

/**
 * Runs DetectFaces on the best frontal frame and returns the estimated age
 * range. Strictly requires exactly one face with a high confidence score.
 *
 * Rekognition can only read images from real AWS S3, so when storage is Tigris
 * (TIGRIS_ENDPOINT set) the frame bytes are fetched and passed as Image.Bytes.
 */
export async function analyzeAgeRange(bestFrameObjectKey: string): Promise<AgeAnalysis> {
  const bucket = getBucket();

  let command: DetectFacesCommand;
  if (process.env.TIGRIS_ENDPOINT) {
    const bytes = await getObjectBytes(bestFrameObjectKey);
    command = new DetectFacesCommand({
      Image: { Bytes: bytes },
      Attributes: ["ALL"],
    });
  } else {
    command = new DetectFacesCommand({
      Image: { S3Object: { Bucket: bucket, Name: bestFrameObjectKey } },
      Attributes: ["ALL"],
    });
  }

  const response: DetectFacesCommandOutput = await getRekognitionClient().send(command);
  return parseDetectFacesResponse(response);
}

/**
 * Pure validation/parsing of a DetectFaces response. Exported for tests.
 * Requires exactly one high-confidence face with a valid age range.
 */
export function parseDetectFacesResponse(
  response: DetectFacesCommandOutput
): AgeAnalysis {
  const details = response.FaceDetails ?? [];

  if (details.length === 0) {
    throw new AgeAnalysisValidationError({ code: "NO_FACE", message: "No face detected in the best frame." });
  }
  if (details.length > 1) {
    throw new AgeAnalysisValidationError({
      code: "MULTIPLE_FACES",
      message: "Multiple faces detected in the best frame.",
    });
  }

  const face = details[0];
  const confidence = face.Confidence ?? 0;

  if (confidence < 99) {
    throw new AgeAnalysisValidationError({
      code: "LOW_CONFIDENCE",
      message: "Face confidence below the required threshold.",
    });
  }

  const low = face.AgeRange?.Low;
  const high = face.AgeRange?.High;

  if (low === undefined || high === undefined) {
    throw new AgeAnalysisValidationError({ code: "MISSING_AGE_RANGE", message: "No age range returned." });
  }
  if (low < 0 || low > 120 || high < 0 || high > 120 || low > high) {
    throw new AgeAnalysisValidationError({ code: "INVALID_AGE_RANGE", message: "Age range out of bounds." });
  }

  return {
    ageLow: low,
    ageHigh: high,
    faceConfidence: confidence,
    pose: {
      yaw: face.Pose?.Yaw ?? 0,
      pitch: face.Pose?.Pitch ?? 0,
      roll: face.Pose?.Roll ?? 0,
    },
    quality: {
      brightness: face.Quality?.Brightness ?? 0,
      sharpness: face.Quality?.Sharpness ?? 0,
    },
    provider: "amazon-rekognition",
    modelVersion: (response as DetectFacesCommandOutput & { FaceModelVersion?: string })
      .FaceModelVersion ?? "unknown",
  };
}

export class AgeAnalysisValidationError extends Error {
  code: AgeAnalysisError["code"];
  constructor(err: AgeAnalysisError) {
    super(err.message);
    this.name = "AgeAnalysisValidationError";
    this.code = err.code;
  }
}
