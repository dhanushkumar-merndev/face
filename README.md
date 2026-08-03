# Face Scan — Direction Challenge, Video Storage and Age-Range Analytics

A production-ready responsive web application that:

- Opens the user's front camera after explicit consent and records a short face-scan video (no audio).
- Guides the user through exactly: **Center → Turn left → Turn right → Look up → Return to center**.
- Verifies each direction in real time using MediaPipe face landmarks and head-pose estimation.
- Captures the best frontal frame from the scan.
- Uploads the video and best frame directly to a **private Amazon S3** bucket via short-lived presigned URLs.
- Stores only metadata, scan results and S3 object keys in **Supabase Postgres** (never media bytes).
- Uses **Amazon Rekognition `DetectFaces`** on the best frontal frame to return an **estimated age range**.
- Provides an authenticated **admin dashboard** to review scans, play videos through temporary signed URLs and delete user data.

This project estimates age range and checks pose only. It does **not** perform face identification, face matching, face search, embeddings or a Rekognition face collection.

---

## Tech stack

- **Next.js 16 (App Router)** + TypeScript (strict) + Tailwind CSS v4 + shadcn-style UI primitives
- **@mediapipe/tasks-vision** Face Landmarker (VIDEO mode, local inference, ~15 FPS)
- **MediaRecorder** for capture (MIME fallback), Canvas for best-frame capture
- **Supabase** (Auth, Postgres, Row Level Security)
- **AWS SDK v3** — S3 (presigned PUT/GET, HeadObject) + Rekognition `DetectFaces`
- **Zod** + **React Hook Form** for validation/forms; `useReducer` for the scanner state machine
- **Vitest** + React Testing Library for unit tests

---

## Project structure

```
src/
  app/
    (public)/privacy|terms      # privacy policy + terms pages
    page.tsx                    # landing page
    scan/capture                # consent -> camera -> guided scan -> upload
    scan/[sessionId]/result     # result + delete-my-data
    admin/                      # login, scans list/detail, settings
    api/scans/...               # session, recording-started, upload-urls, complete, status, delete
    api/admin/...               # scans list/detail, playback-url, retry-analysis, best-frame, delete
  components/
    scan/                       # FaceScanner, CameraPreview, FaceGuideOverlay, ConsentForm, ...
    admin/                      # ScanTable, PrivateVideoPlayer, AdminDeleteButton, AdminRetryButton
    ui/                         # button, card, checkbox, input, label, select, table, badge, alert, textarea
  lib/
    aws/                        # s3.ts, rekognition.ts, presign.ts
    face/                       # config.ts, types.ts, pose.ts, quality.ts, frame-score.ts, challenge-reducer.ts
    scan/                       # api.ts, media-recorder.ts, mime.ts, best-frame.ts, upload.ts, mediapipe.ts
    supabase/                   # browser.ts, server.ts, admin.ts (service-role, server-only)
    auth/                       # admin.ts, session-token.ts, session-guard.ts, session-token-store.ts
    validation/scan.ts          # Zod schemas + required challenge sequence
    security/                   # hash.ts, rate-limit.ts
    api/respond.ts              # standard ApiSuccess/ApiFailure shapes
    logger/
supabase/migrations/0001_face_scan_schema.sql
scripts/copy-mediapipe-assets.mjs
src/proxy.ts                    # edge proxy: security headers + admin UX guard
```

---

## Setup

### 1. Install and copy MediaPipe assets

```bash
pnpm install
pnpm copy:mediapipe   # copies WASM + downloads face_landmarker.task (~3.7 MB) into public/
```

### 2. Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | Public app URL |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase anon (publishable) client |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only.** Never exposed to the browser |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | AWS credentials (server-only) |
| `AWS_S3_BUCKET` | Private bucket name |
| `AWS_KMS_KEY_ID` | Optional SSE-KMS key ARN (empty → SSE-S3) |
| `SCAN_UPLOAD_URL_TTL_SECONDS` / `SCAN_PLAYBACK_URL_TTL_SECONDS` | Presigned URL lifetimes |
| `SCAN_MAX_VIDEO_BYTES` / `SCAN_MAX_IMAGE_BYTES` | Upload size limits |
| `SCAN_RETENTION_DAYS` | Default retention (30 days) |
| `SCAN_CONSENT_VERSION` | Consent text version recorded on every scan |
| `SCAN_SESSION_COOKIE_SECRET` | ≥32 chars; HMAC key for anonymous session tokens |
| `ADMIN_EMAIL_ALLOWLIST` | Comma-separated admin emails (Supabase Auth email login) |
| `LIVENESS_MODE` | `CUSTOM_CHALLENGE` (MVP) or `AWS_FACE_LIVENESS` |

### 3. Supabase

1. Create a project.
2. Run the migration: `supabase/migrations/0001_face_scan_schema.sql` (Supabase SQL editor or `supabase db push`).
3. Add your admin email to `admin_profiles` (or to `ADMIN_EMAIL_ALLOWLIST`).
4. Configure the Auth provider (e.g. Google) used by `/admin/login`.

### 4. AWS

1. Create one **private** S3 bucket: `face-scan-private-<env>`.
   - Block all public access; disable ACLs; enable default encryption (SSE-KMS preferred).
   - Enable lifecycle expiration matching your retention period.
   - Configure CORS for your origins (see section below).
2. Create an IAM user/role with **least privilege**:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:HeadObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::face-scan-private-*/*"
    },
    {
      "Effect": "Allow",
      "Action": "rekognition:DetectFaces",
      "Resource": "*"
    }
  ]
}
```

### 5. Run

```bash
pnpm dev        # http://localhost:3000
```

---

## S3 CORS example

```json
[
  {
    "AllowedHeaders": ["content-type", "x-amz-checksum-sha256", "x-amz-server-side-encryption"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedOrigins": ["http://localhost:3000", "https://your-production-domain.example"],
    "ExposeHeaders": ["ETag", "x-amz-checksum-sha256"],
    "MaxAgeSeconds": 3000
  }
]
```

Do not use `*` for production origins.

---

## How the scan works

1. **Consent gate** — the user checks consent, 18+ declaration and approximate-result acknowledgement. The camera is not started before consent.
2. **Camera + MediaPipe** — front camera streams; Face Landmarker runs locally at ~15 FPS with `numFaces: 2` so multiple faces block progress. Quality checks cover lighting, blur, face size/centering, occlusion.
3. **Challenge** — `CENTER → LEFT → RIGHT → UP → CENTER_FINAL`. Each step requires a continuous hold (default 650 ms / ≥8 stable frames). There is intentionally **no DOWN step** anywhere.
4. **Recording** — `MediaRecorder` with MIME fallback (`vp9 → vp8 → h264 → mp4 → webm`), 1 s timeslice, no audio, capped at 25 s / 30 MB.
5. **Best frame** — during `CENTER_FINAL` the highest-scoring frontal frame (pose + sharpness + exposure + centering + size − occlusion) is cropped from the **original** resolution and encoded as high-quality JPEG (≤1600 px, quality 0.9).
6. **Upload** — the browser requests server-generated S3 keys + 5-minute presigned PUT URLs, uploads video and best frame directly to S3, then calls `/complete`.
7. **Analysis** — the server `HeadObject`s both objects, verifies metadata, then calls Rekognition `DetectFaces` (Attributes: `ALL`) on the best frame. Requires exactly one face with confidence ≥ 99; stores `AgeRange.Low/High`, pose, quality, provider and model version.
8. **Result** — shown as an estimated range (e.g. `24–32 years`) with a clear disclaimer. A failed/incomplete challenge never receives an age result.
9. **Delete** — the user (or an admin) can request deletion; S3 objects are removed, PII anonymized, record marked deleted. Idempotent.

---

## Security model

- All AWS credentials and the Supabase service-role key exist **only on the server**.
- Anonymous scans use an **HttpOnly, Secure, SameSite=Lax** cookie containing a random 32-byte token; only its HMAC-SHA256 hash is stored in `scan_session_tokens`.
- Every `/api/scans/:id/*` route validates the session token and state.
- Every `/api/admin/*` route enforces admin authorization server-side (admin profile row or email allowlist).
- S3 object keys are **always server-generated**; the client never supplies a key.
- Uploads are verified with `HeadObject` (content length + expected key) before analysis.
- No permanent public media URLs anywhere; admin playback uses short-lived signed GET URLs.
- Security headers set in `src/proxy.ts`; rate limiting on session creation and upload URL generation.
- RLS enabled on all tables; anonymous rows are not readable through the Supabase client directly.

---

## Scripts

```bash
pnpm dev              # dev server
pnpm build            # production build
pnpm start            # serve production build
pnpm lint             # ESLint
pnpm typecheck        # tsc --noEmit
pnpm test             # Vitest unit tests
pnpm copy:mediapipe   # copy WASM + download face model into public/
```

---

## Tests

Unit tests cover:

- Pose matrix conversion (`pose.test.ts`)
- Step predicates + hold-duration reset logic (`quality.test.ts`, `challenge-reducer.test.ts`)
- Frame scoring (`frame-score.test.ts`)
- MIME selection + S3 key generation (`mime.test.ts`)
- Zod schemas + required challenge sequence (`scan.test.ts`)
- Age-range validation (`rekognition.test.ts`)
- Hashing + rate limiting (`security.test.ts`)

E2E camera tests may use a prerecorded fake-media stream in Chromium; the scanner logic is isolated in the pure reducer so it can be driven deterministically.

---

## Deployment

- **Web**: Vercel (env vars from `.env.example`).
- **Supabase**: managed Postgres + Auth; run the migration; configure auth providers.
- **AWS**: S3 + Rekognition in one region; least-privilege IAM; S3 CORS + encryption + lifecycle rules.
- Set `SCAN_SESSION_COOKIE_SECRET` to a long random value and rotate the `SUPABASE_SERVICE_ROLE_KEY` / AWS keys out of any client bundle.

---

## License

Proprietary / internal. See your organization's policy.
