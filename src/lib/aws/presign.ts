export {
  getS3Client,
  getBucket,
  buildObjectKey,
  createPresignedUpload,
  headObject,
  createPlaybackUrl,
  deleteObjects,
} from "@/lib/aws/s3";
export type { PresignedUpload, ObjectHead } from "@/lib/aws/s3";
export { analyzeAgeRange, AgeAnalysisValidationError } from "@/lib/aws/rekognition";
export type { AgeAnalysis, AgeAnalysisError } from "@/lib/aws/rekognition";
