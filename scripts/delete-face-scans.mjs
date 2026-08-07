/**
 * Wipes every face-scan artefact: the media objects in Tigris (or AWS S3) and
 * the scan rows in Supabase. Intended for resetting demo/test data.
 *
 * Usage:
 *   pnpm delete:face            # dry run — reports what would be deleted
 *   pnpm delete:face -- --yes   # actually delete
 *
 * Deleting is irreversible, so the dry run is the default and `--yes` is
 * required to destroy anything.
 *
 * Leaves auth users, admin_profiles and scan_audit_events alone: the audit
 * trail is meant to outlive the media it describes (its session_id is ON DELETE
 * SET NULL, so those rows survive with a null reference).
 */
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envLocal = join(root, ".env.local");
if (existsSync(envLocal)) config({ path: envLocal });
config({ path: join(root, ".env") });

const CONFIRM = process.argv.includes("--yes");
const PREFIX = "face-scans/";

const bucket = process.env.AWS_S3_BUCKET;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!bucket) {
  console.error("AWS_S3_BUCKET is not set.");
  process.exit(1);
}
if (!supabaseUrl || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set.");
  process.exit(1);
}

// Mirrors src/lib/aws/s3.ts: Tigris needs region "auto" and its own endpoint.
const tigrisEndpoint = process.env.TIGRIS_ENDPOINT;
const s3 = new S3Client({
  region: tigrisEndpoint ? "auto" : process.env.AWS_REGION ?? "ap-south-1",
  ...(tigrisEndpoint ? { endpoint: tigrisEndpoint, forcePathStyle: false } : {}),
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
  },
});

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Every object under the scan prefix, following pagination to the end. */
async function listAllObjects() {
  const keys = [];
  let token;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: PREFIX,
        ContinuationToken: token,
      })
    );
    for (const o of res.Contents ?? []) {
      if (o.Key) keys.push({ key: o.Key, size: o.Size ?? 0 });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

async function countRows(table) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

async function main() {
  console.log(`storage : ${tigrisEndpoint ?? "AWS S3"}`);
  console.log(`bucket  : ${bucket}`);
  console.log(`prefix  : ${PREFIX}\n`);

  const objects = await listAllObjects();
  const bytes = objects.reduce((sum, o) => sum + o.size, 0);

  const sessions = await countRows("scan_sessions");
  const assets = await countRows("scan_assets");
  const steps = await countRows("scan_steps");

  console.log("would delete:");
  console.log(`  objects        ${objects.length} (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`  scan_sessions  ${sessions}`);
  console.log(`  scan_assets    ${assets}  (cascades from sessions)`);
  console.log(`  scan_steps     ${steps}  (cascades from sessions)`);

  if (!CONFIRM) {
    console.log("\nDRY RUN — nothing was deleted.");
    console.log("Re-run with:  pnpm delete:face -- --yes");
    return;
  }

  console.log("\ndeleting...");

  // S3 DeleteObjects caps at 1000 keys per call.
  let deleted = 0;
  for (let i = 0; i < objects.length; i += 1000) {
    const chunk = objects.slice(i, i + 1000);
    const res = await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: chunk.map((o) => ({ Key: o.key })), Quiet: true },
      })
    );
    for (const err of res.Errors ?? []) {
      console.error(`  failed: ${err.Key} — ${err.Message}`);
    }
    deleted += chunk.length - (res.Errors?.length ?? 0);
  }
  console.log(`  objects deleted: ${deleted}/${objects.length}`);

  // scan_assets and scan_steps cascade from scan_sessions.
  const { error } = await supabase
    .from("scan_sessions")
    .delete()
    .gt("created_at", "1970-01-01");
  if (error) {
    console.error(`  scan_sessions delete failed: ${error.message}`);
    process.exit(1);
  }

  const [s, a, st] = await Promise.all([
    countRows("scan_sessions"),
    countRows("scan_assets"),
    countRows("scan_steps"),
  ]);
  console.log(`  rows remaining: sessions=${s} assets=${a} steps=${st}`);
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
