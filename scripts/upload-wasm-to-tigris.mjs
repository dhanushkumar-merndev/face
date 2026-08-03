/**
 * Bulk uploads MediaPipe WASM and model files directly to the main S3/Tigris bucket ("face")
 * and generates long-lived presigned GET URLs (up to 7-30 days expiration).
 *
 * Usage:
 *   pnpm upload:wasm
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import dotenv from "dotenv";

dotenv.config();

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const endpoint = process.env.TIGRIS_ENDPOINT || "https://t3.storage.dev";
const region = process.env.AWS_REGION || "auto";
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const bucket = process.env.AWS_S3_BUCKET || "face";

// Presigned URL expiration (in seconds). Default to 7 days (604,800 seconds) or 30 days (2,592,000 seconds).
const EXPIRATION_SECONDS = 7 * 24 * 3600; // 7 days

if (!accessKeyId || !secretAccessKey) {
  console.error("Error: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set in .env");
  process.exit(1);
}

const s3 = new S3Client({
  endpoint,
  region,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
  forcePathStyle: true,
});

function getContentType(filename) {
  if (filename.endsWith(".wasm")) return "application/wasm";
  if (filename.endsWith(".js")) return "application/javascript";
  if (filename.endsWith(".task")) return "application/octet-stream";
  if (filename.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

async function uploadAndPresignDirectory(localDir, s3Prefix) {
  const files = readdirSync(localDir);
  const results = {};

  for (const file of files) {
    const fullPath = join(localDir, file);
    if (statSync(fullPath).isFile()) {
      const key = `${s3Prefix}/${file}`.replace(/^\/+/, "");
      const body = readFileSync(fullPath);
      const contentType = getContentType(file);

      console.log(`Uploading ${file} (${(body.length / 1024 / 1024).toFixed(2)} MB) to s3://${bucket}/${key} ...`);

      try {
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
            CacheControl: "public, max-age=31536000, immutable",
          })
        );

        // Generate presigned GET URL
        const presignedUrl = await getSignedUrl(
          s3,
          new GetObjectCommand({
            Bucket: bucket,
            Key: key,
          }),
          { expiresIn: EXPIRATION_SECONDS }
        );

        results[file] = presignedUrl;
        console.log(`✓ Uploaded ${key} successfully`);
      } catch (err) {
        console.error(`✕ Failed to upload ${key}:`, err.message);
      }
    }
  }

  return results;
}

async function main() {
  console.log(`Starting bulk upload to Tigris Data bucket "${bucket}" ...`);

  const wasmDir = join(root, "public", "mediapipe", "wasm");
  const modelDir = join(root, "public", "models");

  console.log("\n--- Uploading WASM files ---");
  const wasmUrls = await uploadAndPresignDirectory(wasmDir, "mediapipe/wasm");

  console.log("\n--- Uploading Model file ---");
  const modelUrls = await uploadAndPresignDirectory(modelDir, "models");

  console.log("\n=======================================================");
  console.log(`Bulk upload to bucket "${bucket}" complete!`);
  console.log(`Presigned GET URLs (Expires in 7 days):`);
  console.log("=======================================================\n");

  if (modelUrls["face_landmarker.task"]) {
    console.log("Model Presigned URL:\n", modelUrls["face_landmarker.task"], "\n");
  }

  console.log("WASM Presigned Base Directory (for FilesetResolver):\n", wasmUrls["vision_wasm_internal.wasm"] ? wasmUrls["vision_wasm_internal.wasm"].replace(/\/vision_wasm_internal\.wasm\?.*$/, "") : "N/A");
}

main().catch((err) => {
  console.error("Upload error:", err);
  process.exit(1);
});
