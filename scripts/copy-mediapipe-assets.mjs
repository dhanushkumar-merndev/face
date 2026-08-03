/**
 * Copies MediaPipe WASM + model assets from node_modules into public/ so the
 * Face Landmarker can be loaded without a CDN.
 *
 * The face_landmarker.task model is NOT bundled with the npm package — it must
 * be downloaded from Google's MediaPipe models storage. This script attempts
 * the download (Node 18+ has global fetch) and falls back to instructions.
 *
 * Run: pnpm copy:mediapipe
 */
import { copyFileSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const visionPkg = join(
  root,
  "node_modules",
  "@mediapipe",
  "tasks-vision",
  "wasm"
);

const target = join(root, "public", "mediapipe", "wasm");
mkdirSync(target, { recursive: true });

const files = [
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.wasm",
];

let copied = 0;
for (const f of files) {
  const src = join(visionPkg, f);
  if (existsSync(src)) {
    copyFileSync(src, join(target, f));
    copied += 1;
    console.log(`copied ${f}`);
  } else {
    console.warn(`missing ${src}`);
  }
}

// Download the face landmarker model into public/models/.
const modelDir = join(root, "public", "models");
mkdirSync(modelDir, { recursive: true });
const modelPath = join(modelDir, "face_landmarker.task");
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

if (!existsSync(modelPath)) {
  try {
    console.log("downloading face_landmarker.task …");
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(modelPath, buf);
    console.log(`downloaded ${buf.length} bytes`);
  } catch (err) {
    console.error(
      "Could not download the face model. Place face_landmarker.task in public/models/ manually:",
      MODEL_URL
    );
    console.error(err);
    process.exit(1);
  }
} else {
  console.log("face_landmarker.task already present");
}

if (copied === 0) {
  console.error("No MediaPipe WASM files found — check @mediapipe/tasks-vision install.");
  process.exit(1);
}

console.log("MediaPipe assets ready.");

