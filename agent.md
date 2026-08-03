# AGENT.md — Face Scan, Direction Challenge, Video Storage and Age-Range Analytics

## 1. Agent role

You are the lead full-stack engineer responsible for building this project end to end.

Build a production-ready responsive web application that:

1. Opens the user's front camera after explicit consent.
2. Records a short face-scan video.
3. Guides the user through these required movements only:
   - Center
   - Turn left
   - Turn right
   - Look up
   - Return to center
4. Does **not** ask the user to look down.
5. Verifies each direction in real time using face landmarks and head-pose estimation.
6. Captures the best frontal image from the scan.
7. Uploads the video and best frame directly to a private Amazon S3 bucket.
8. Stores only metadata, scan results and S3 object keys in Supabase Postgres.
9. Uses Amazon Rekognition `DetectFaces` on the best frontal frame to return an estimated age range.
10. Provides an authenticated admin dashboard to review scans, play videos through temporary signed URLs and delete user data.

Do not build face identification, face matching, face search, face embeddings or a Rekognition face collection. This project estimates age range and checks pose only; it must not identify who the person is.

---

## 2. Non-negotiable requirements

### Functional requirements

- Mobile-first and desktop responsive.
- Use the device's front-facing camera.
- Mirror the live preview so it feels natural to the user.
- Record video without audio.
- Exactly one face must be visible.
- The face must stay inside the guide oval.
- Detect low light, blur, face too close and face too far.
- Require each direction to be held continuously before passing.
- Required challenge sequence:

```text
CENTER -> LEFT -> RIGHT -> UP -> CENTER_FINAL
```

- Never include a `DOWN` state.
- Store the original recording in S3.
- Store the best frontal frame in S3.
- Optionally store a thumbnail in S3.
- Do not store video binary data or base64 video in Postgres.
- Store S3 bucket/key values in Postgres, never a permanent public URL.
- Use short-lived presigned URLs for uploads and admin playback.
- Age result must be shown as a range, for example `24–32`, not as a guaranteed exact age.
- A failed or incomplete challenge must not receive an age result.
- A user must be able to request deletion of their video, image and database record.

### Privacy requirements

Before camera access, show a clear notice explaining:

- A video selfie will be recorded.
- The required head movements.
- The image/video purpose.
- The estimated age range is approximate.
- How long the data will be retained.
- Who can access the scan.
- How the user can withdraw consent or request deletion.

The user must actively check a consent box and press `Start face scan`.

Do not start the camera or recording before consent.

Default retention must be configurable. Use 30 days for the MVP unless the product owner changes it.

Do not permit scanning of a child unless a compliant verifiable parent/guardian consent flow has been implemented and legally reviewed. For the MVP, show an age declaration such as `I confirm I am 18 or older` before camera access. Do not treat the AI age estimate as legal proof of age.

---

## 3. Recommended stack

Use the following stack unless a dependency is unavailable:

### Web application

- Next.js App Router
- TypeScript with strict mode
- React
- Tailwind CSS
- shadcn/ui for accessible UI components
- Zod for request validation
- React Hook Form for forms
- `useReducer` for the scanner state machine

### Browser face processing

- `@mediapipe/tasks-vision`
- MediaPipe Face Landmarker in `VIDEO` running mode
- Use facial transformation matrices or stable landmark geometry to calculate yaw, pitch and roll
- Use Canvas only for capturing the best frame; do not run heavy server-side video processing for the MVP

### Camera and recording

- `navigator.mediaDevices.getUserMedia`
- Native `MediaRecorder`
- `MediaRecorder.isTypeSupported` for MIME fallback

### Database and authentication

- Supabase Auth
- Supabase Postgres
- Supabase Row Level Security
- SQL migrations committed to the repository

### AWS

- Amazon S3 for video, best frame, thumbnails and optional telemetry files
- AWS SDK for JavaScript v3
- Amazon Rekognition `DetectFaces` for age range
- Optional Amazon Rekognition Face Liveness only when stronger anti-spoof protection is required

### Deployment

- Vercel for the Next.js web application
- Supabase managed Postgres/Auth
- AWS S3 and Rekognition in one selected AWS region

Do not use Redis for the MVP. The scan state is stored in the browser while scanning and persisted to Postgres at controlled checkpoints.

---

## 4. High-level architecture

```text
User browser
  |
  |-- Camera stream through getUserMedia
  |-- MediaPipe face landmarks and head pose locally
  |-- MediaRecorder records short video locally
  |-- Canvas captures best frontal JPEG locally
  |
  |-- POST /api/scans/session
  |       Creates database session and secure session token
  |
  |-- POST /api/scans/:id/upload-urls
  |       Server creates short-lived S3 PUT presigned URLs
  |
  |-- PUT video directly to private S3
  |-- PUT best frame directly to private S3
  |
  |-- POST /api/scans/:id/complete
          Server verifies S3 objects with HeadObject
          Server calls Rekognition DetectFaces on best frame
          Server stores age range and quality metadata in Postgres

Admin dashboard
  |
  |-- GET /api/admin/scans
  |-- GET /api/admin/scans/:id
  |-- POST /api/admin/scans/:id/playback-url
          Returns short-lived S3 GET presigned URL
  |-- DELETE /api/admin/scans/:id
          Deletes S3 objects and marks/deletes database data
```

Important: AWS credentials and Supabase service-role credentials must exist only on the server.

---

## 5. User experience flow

### Page 1: Landing page

Show:

- Product explanation
- `Start scan` button
- Approximate scan duration: 10–20 seconds
- Privacy summary
- Link to full privacy policy

### Page 2: Consent and preparation

Required controls:

- Name, phone or email only if the business requires them
- Checkbox: consent to recording and age-range analysis
- Checkbox: confirm age 18+
- Checkbox: acknowledge approximate results
- `Start face scan` button

Preparation tips:

- Remove mask or anything blocking the face
- Use even lighting
- Keep only one person in view
- Hold the device steady
- Do not use beauty filters

### Page 3: Camera permission

After consent:

1. Request front-camera permission.
2. If permission is denied, show exact recovery instructions.
3. Show preview before recording begins.
4. Wait until one valid face is centered.
5. Show `Ready` and begin a 3-second countdown.

### Page 4: Guided scan

Display:

- Mirrored video preview
- Oval face guide
- Current instruction
- Five-step progress indicator
- Quality warning messages
- Cancel button

Sequence:

```text
1. Look straight
2. Slowly turn your face left
3. Slowly turn your face right
4. Slowly look up
5. Return to the center
```

Recording begins at the start of step 1 and stops immediately after step 5 passes.

### Page 5: Upload and analysis

Show progress states:

```text
Preparing recording
Uploading video
Uploading best frame
Analyzing face
Saving result
Complete
```

Do not allow double submission.

### Page 6: Result

Show:

- Estimated age range
- Scan completed status
- Recording date/time
- Clear disclaimer that the estimate may be inaccurate
- Delete-my-data action
- Retry action

Do not show unsupported claims such as personality, intelligence, ethnicity, health, attractiveness or criminal tendency.

---

## 6. Scanner state machine

Create these exact TypeScript states:

```ts
export type ScanStep =
  | "PREPARING"
  | "CENTER"
  | "LEFT"
  | "RIGHT"
  | "UP"
  | "CENTER_FINAL"
  | "RECORDING_COMPLETE"
  | "UPLOADING"
  | "ANALYZING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";
```

Never add `DOWN`.

Each challenge step passes only after all conditions remain valid for a continuous hold duration.

Default configurable thresholds:

```ts
export const SCAN_CONFIG = {
  maxDurationMs: 25_000,
  countdownMs: 3_000,
  requiredHoldMs: 650,
  minimumStableFrames: 8,
  faceConfidenceMin: 0.9,
  centerYawAbsMax: 12,
  centerPitchAbsMax: 10,
  centerRollAbsMax: 12,
  leftYawMax: -20,
  rightYawMin: 20,
  upPitchThreshold: -15,
  faceAreaMinRatio: 0.12,
  faceAreaMaxRatio: 0.58,
  maxCenterOffsetRatio: 0.18,
  lostFaceGraceMs: 400,
} as const;
```

The pitch sign may vary depending on the matrix conversion. Verify it on real devices. If looking up produces positive pitch in the implementation, invert only the `UP` comparison. Do not change the UX sequence.

### Step pass rules

#### CENTER

```text
abs(yaw) <= 12 degrees
abs(pitch) <= 10 degrees
abs(roll) <= 12 degrees
face centered
face size valid
one face only
quality valid
held for at least 650 ms
```

#### LEFT

The user turns their own face to the left. Because the preview is mirrored, test the physical movement carefully.

```text
yaw <= -20 degrees
abs(pitch) <= 15 degrees
abs(roll) <= 15 degrees
face remains mostly inside guide
held for at least 650 ms
```

If the pose convention is reversed, flip the yaw signs once in the pose adapter; do not scatter sign changes throughout the UI.

#### RIGHT

```text
yaw >= 20 degrees
abs(pitch) <= 15 degrees
abs(roll) <= 15 degrees
face remains mostly inside guide
held for at least 650 ms
```

#### UP

`UP` means tilt the head and look upward. It does not mean moving the face to the top of the screen.

```text
pitch <= -15 degrees after pose convention calibration
abs(yaw) <= 18 degrees
abs(roll) <= 15 degrees
held for at least 650 ms
```

#### CENTER_FINAL

Use the same rules as CENTER. During this step, continuously score candidate frames and preserve the best one.

### Stability rule

For each frame:

1. Calculate whether the current step condition passes.
2. If it passes, add elapsed time to `stableDurationMs`.
3. If it fails briefly for less than `lostFaceGraceMs`, pause without advancing.
4. If it fails longer, reset `stableDurationMs` to zero.
5. Advance only after both:
   - `stableDurationMs >= requiredHoldMs`
   - `stableFrames >= minimumStableFrames`

---

## 7. Face and quality validation

Before processing a direction, enforce:

- Exactly one face.
- Face detection confidence above threshold.
- Face not occluded.
- Both eyes reasonably visible where possible.
- Face bounding box area inside configured range.
- Face center close to guide center.
- Lighting not excessively dark or bright.
- Frame not heavily blurred.

Quality messages:

```text
No face detected
More than one face detected
Move closer
Move farther away
Center your face
Improve the lighting
Hold the phone steady
Keep your full face visible
```

Do not advance while a quality error is active.

### Client-side blur score

Use a small grayscale canvas and compute variance of the Laplacian or a similarly lightweight edge-strength score. Keep the threshold configurable because camera resolution changes the scale.

### Client-side lighting score

Calculate mean luminance on the face crop, not the full background.

Recommended initial normalized luminance range:

```text
0.20 to 0.85
```

Test and tune on Android, iPhone, laptop webcams and varied skin tones. Do not reject users based on skin tone; evaluate exposure and image quality only.

---

## 8. MediaPipe implementation

Initialize Face Landmarker only in the browser using a dynamic import and a client component.

Required options:

```ts
{
  runningMode: "VIDEO",
  numFaces: 2,
  outputFaceBlendshapes: true,
  outputFacialTransformationMatrixes: true,
  minFaceDetectionConfidence: 0.7,
  minFacePresenceConfidence: 0.7,
  minTrackingConfidence: 0.7,
}
```

Use `numFaces: 2` so the application can reliably reject multiple faces.

Run detection at a controlled rate, approximately 12–20 frames per second. Do not run more inference loops than necessary.

```ts
const TARGET_INFERENCE_INTERVAL_MS = 66; // approximately 15 FPS
```

Use `requestAnimationFrame`, but skip inference until the interval has elapsed.

### Head-pose adapter

Create one function that converts the MediaPipe transformation matrix into a standard pose:

```ts
export interface HeadPose {
  yaw: number;
  pitch: number;
  roll: number;
}

export function matrixToHeadPose(matrix: number[]): HeadPose {
  // Convert matrix to Euler angles.
  // Normalize output to degrees.
  // Apply sign correction in one place only.
  // Return physical-user directions, independent of mirrored UI.
}
```

Write unit tests using known matrices or fixtures.

Create a development-only calibration panel showing live yaw, pitch and roll values. Hide it in production.

---

## 9. Camera and video recording

Request camera access with:

```ts
const stream = await navigator.mediaDevices.getUserMedia({
  audio: false,
  video: {
    facingMode: "user",
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30, max: 30 },
  },
});
```

Select MIME type in this order:

```ts
const MIME_CANDIDATES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/mp4;codecs=h264",
  "video/mp4",
  "video/webm",
];
```

Use the first value supported by `MediaRecorder.isTypeSupported`. If none are explicitly supported, create `MediaRecorder(stream)` without a MIME option and read the resulting `recorder.mimeType`.

Use:

```ts
recorder.start(1000);
```

Collect `dataavailable` chunks. Stop recording after `CENTER_FINAL` passes or when timeout/cancel occurs.

Never upload a recording that has zero bytes.

### Size controls

Default limits:

```text
Maximum recording duration: 25 seconds
Maximum upload size: 30 MB
No audio
Target resolution: 720p
```

Show a user-friendly error if the final Blob is too large.

---

## 10. Best-frame capture

During `CENTER_FINAL`, evaluate every eligible frontal frame.

Score candidate frames using:

```text
frontal pose score
+ face-centered score
+ sharpness score
+ exposure score
+ face-size score
- occlusion penalty
```

Example normalized formula:

```ts
score =
  frontalScore * 0.35 +
  sharpnessScore * 0.25 +
  exposureScore * 0.15 +
  centeredScore * 0.15 +
  faceSizeScore * 0.10;
```

Capture the best frame from the original video dimensions, not from a low-resolution analysis canvas.

Crop the face with 25–35% margin around the bounding box. Keep the full forehead, chin and both ears where possible.

Encode as JPEG:

```text
quality: 0.9
maximum output dimension: 1600 px
```

Save as `best-frame.jpg`.

Optionally create a smaller admin thumbnail such as 320×320 JPEG.

---

## 11. S3 storage rules

Create one private bucket, for example:

```text
face-scan-private-<environment>
```

Required bucket configuration:

- Block all public access.
- Disable public ACL use.
- Enable default encryption.
- Prefer SSE-KMS for face videos and images.
- Enable S3 Bucket Key when using SSE-KMS.
- Enable lifecycle expiration based on the configured retention period.
- Restrict CORS to approved web origins.
- Do not expose object keys through public pages.
- Use IAM least privilege.

Object key pattern:

```text
face-scans/{tenantId}/{yyyy}/{mm}/{sessionId}/original.{ext}
face-scans/{tenantId}/{yyyy}/{mm}/{sessionId}/best-frame.jpg
face-scans/{tenantId}/{yyyy}/{mm}/{sessionId}/thumbnail.jpg
face-scans/{tenantId}/{yyyy}/{mm}/{sessionId}/telemetry.json.gz
```

For a single-tenant MVP, use `default` as `tenantId`.

The server must generate every key. Never accept an arbitrary S3 key from the client.

### Presigned upload rules

- URL expiry: 5 minutes.
- Bind the expected content type.
- Bind a maximum expected file size in application validation.
- Use a random UUID session ID.
- Verify the uploaded object afterward using `HeadObject`.
- Compare content type, content length and expected key.
- Store the returned ETag and size.

For short 10–25 second recordings, a single presigned PUT is sufficient. Add multipart upload only if recordings become large or uploads must survive unstable networks.

### Playback rules

- Bucket remains private.
- Admin requests a GET presigned URL from the backend.
- Playback URL expiry: 60–300 seconds.
- Do not store the temporary signed URL in Postgres.

---

## 12. Database schema

Create a Supabase migration with the following schema. Adjust syntax only when required by the current Supabase Postgres version.

```sql
create extension if not exists pgcrypto;

create type public.scan_status as enum (
  'created',
  'consented',
  'recording',
  'uploading',
  'uploaded',
  'analyzing',
  'completed',
  'failed',
  'cancelled',
  'deletion_requested',
  'deleted'
);

create type public.scan_step_name as enum (
  'CENTER',
  'LEFT',
  'RIGHT',
  'UP',
  'CENTER_FINAL'
);

create type public.scan_asset_kind as enum (
  'video',
  'best_frame',
  'thumbnail',
  'telemetry'
);

create table public.scan_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid null,
  user_id uuid null references auth.users(id) on delete set null,

  subject_name text null,
  subject_email text null,
  subject_phone text null,

  status public.scan_status not null default 'created',

  consent_given boolean not null default false,
  consent_version text null,
  consent_text_hash text null,
  consented_at timestamptz null,
  adult_declaration boolean not null default false,

  challenge_version text not null default 'center-left-right-up-center-v1',
  challenge_sequence jsonb not null default '["CENTER","LEFT","RIGHT","UP","CENTER_FINAL"]'::jsonb,

  recording_started_at timestamptz null,
  recording_completed_at timestamptz null,
  duration_ms integer null check (duration_ms is null or duration_ms between 0 and 60000),

  age_low integer null check (age_low is null or age_low between 0 and 120),
  age_high integer null check (age_high is null or age_high between 0 and 120),
  age_provider text null,
  age_model_version text null,
  age_analyzed_at timestamptz null,

  face_confidence numeric(6,3) null,
  face_count integer null,
  rekognition_pose jsonb null,
  rekognition_quality jsonb null,
  quality_summary jsonb null,

  custom_challenge_passed boolean not null default false,
  managed_liveness_used boolean not null default false,
  managed_liveness_score numeric(6,3) null,

  failure_code text null,
  failure_message text null,

  retention_until timestamptz null,
  deleted_at timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.scan_steps (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.scan_sessions(id) on delete cascade,
  step public.scan_step_name not null,
  step_order smallint not null,
  passed boolean not null default false,
  started_at timestamptz null,
  completed_at timestamptz null,
  hold_ms integer null,
  representative_yaw numeric(7,3) null,
  representative_pitch numeric(7,3) null,
  representative_roll numeric(7,3) null,
  frame_timestamp_ms integer null,
  quality jsonb null,
  created_at timestamptz not null default now(),
  unique(session_id, step)
);

create table public.scan_assets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.scan_sessions(id) on delete cascade,
  kind public.scan_asset_kind not null,
  bucket text not null,
  object_key text not null,
  mime_type text not null,
  byte_size bigint null check (byte_size is null or byte_size >= 0),
  etag text null,
  checksum_sha256 text null,
  width integer null,
  height integer null,
  duration_ms integer null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz null,
  unique(session_id, kind),
  unique(bucket, object_key)
);

create table public.scan_audit_events (
  id bigint generated always as identity primary key,
  session_id uuid null references public.scan_sessions(id) on delete set null,
  actor_user_id uuid null references auth.users(id) on delete set null,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  ip_hash text null,
  user_agent text null,
  created_at timestamptz not null default now()
);

create table public.scan_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.scan_sessions(id) on delete cascade,
  requester_user_id uuid null references auth.users(id) on delete set null,
  requester_email text null,
  status text not null default 'pending' check (status in ('pending','processing','completed','rejected')),
  reason text null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz null
);

create index scan_sessions_created_at_idx on public.scan_sessions(created_at desc);
create index scan_sessions_status_idx on public.scan_sessions(status);
create index scan_sessions_user_id_idx on public.scan_sessions(user_id);
create index scan_sessions_retention_idx on public.scan_sessions(retention_until) where deleted_at is null;
create index scan_steps_session_idx on public.scan_steps(session_id, step_order);
create index scan_assets_session_idx on public.scan_assets(session_id);
create index scan_audit_session_idx on public.scan_audit_events(session_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger scan_sessions_set_updated_at
before update on public.scan_sessions
for each row execute function public.set_updated_at();
```

### RLS strategy

Enable RLS on all public tables.

- Authenticated users may read their own sessions.
- Authenticated users may request deletion of their own sessions.
- Admin access must be checked using a server-side admin role/profile table.
- Anonymous sessions must not be readable directly through the Supabase client.
- All anonymous session creation/completion must pass through Next.js route handlers.
- Never expose the Supabase service-role key to the browser.

For the MVP, keep admin mutations server-only.

---

## 13. Secure anonymous session token

The app may support scans without account login.

When creating a session:

1. Generate a cryptographically random 32-byte token.
2. Store only a SHA-256 hash of the token in a private server-only table or encrypted column.
3. Return the raw token in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie scoped to the scan flow.
4. Validate the token for upload URL generation, completion, status and deletion.
5. Expire the token after the retention or session timeout period.

Do not place the session token in a query string.

---

## 14. API contracts

All endpoints must use Zod validation and return a standard shape:

```ts
type ApiSuccess<T> = { success: true; data: T };
type ApiFailure = {
  success: false;
  error: {
    code: string;
    message: string;
    fieldErrors?: Record<string, string[]>;
  };
};
```

### POST `/api/scans/session`

Purpose: create a scan after consent.

Request:

```json
{
  "subjectName": "Optional",
  "subjectEmail": "optional@example.com",
  "subjectPhone": "+919999999999",
  "consentGiven": true,
  "adultDeclaration": true,
  "consentVersion": "2026-08-v1"
}
```

Server actions:

- Validate consent and adult declaration.
- Create session.
- Set `status = consented`.
- Set retention date.
- Create session cookie/token.
- Record audit event.

Response:

```json
{
  "success": true,
  "data": {
    "sessionId": "uuid",
    "challenge": ["CENTER", "LEFT", "RIGHT", "UP", "CENTER_FINAL"],
    "maxDurationMs": 25000
  }
}
```

### POST `/api/scans/:id/recording-started`

Set `status = recording` and `recording_started_at`.

### POST `/api/scans/:id/upload-urls`

Request:

```json
{
  "video": {
    "mimeType": "video/webm;codecs=vp8",
    "byteSize": 8000000,
    "extension": "webm"
  },
  "bestFrame": {
    "mimeType": "image/jpeg",
    "byteSize": 350000,
    "extension": "jpg"
  },
  "thumbnail": null
}
```

Server actions:

- Validate ownership/session token.
- Validate session status.
- Validate allowed MIME types and extensions.
- Validate byte sizes.
- Generate server-owned object keys.
- Create presigned PUT URLs valid for 5 minutes.
- Update `status = uploading`.

Response:

```json
{
  "success": true,
  "data": {
    "video": {
      "url": "temporary-presigned-url",
      "objectKey": "server-generated-key",
      "headers": { "Content-Type": "video/webm;codecs=vp8" }
    },
    "bestFrame": {
      "url": "temporary-presigned-url",
      "objectKey": "server-generated-key",
      "headers": { "Content-Type": "image/jpeg" }
    }
  }
}
```

### POST `/api/scans/:id/complete`

Request:

```json
{
  "durationMs": 14250,
  "video": {
    "objectKey": "exact-key-returned-by-server",
    "mimeType": "video/webm;codecs=vp8",
    "byteSize": 8000000,
    "etag": "optional"
  },
  "bestFrame": {
    "objectKey": "exact-key-returned-by-server",
    "mimeType": "image/jpeg",
    "byteSize": 350000,
    "etag": "optional",
    "width": 900,
    "height": 900
  },
  "steps": [
    {
      "step": "CENTER",
      "stepOrder": 1,
      "passed": true,
      "holdMs": 720,
      "yaw": 1.3,
      "pitch": -0.8,
      "roll": 0.5,
      "frameTimestampMs": 2800
    }
  ],
  "qualitySummary": {
    "minimumFaceCount": 1,
    "maximumFaceCount": 1,
    "averageBrightness": 0.56,
    "bestSharpness": 0.81
  }
}
```

Server actions in this order:

1. Validate session and state.
2. Verify the sequence contains all five required steps in the exact allowed order.
3. Reject any sequence containing `DOWN` or unknown values.
4. Verify every step passed.
5. Call S3 `HeadObject` for both objects.
6. Confirm object keys match server-generated keys.
7. Confirm byte sizes are within limits.
8. Insert/update asset rows.
9. Set `status = uploaded`.
10. Set `status = analyzing`.
11. Call Amazon Rekognition `DetectFaces` on `best-frame.jpg` with `Attributes: ["ALL"]`.
12. Require exactly one face with high face confidence.
13. Save `AgeRange.Low`, `AgeRange.High`, pose and quality.
14. Set `status = completed` and timestamps.
15. Record audit event.

If Rekognition fails, keep the video and frame only according to retention policy, set a safe failure code and allow retry by an admin.

### GET `/api/scans/:id/status`

Return only the minimum user-safe result:

```json
{
  "success": true,
  "data": {
    "status": "completed",
    "ageRange": { "low": 24, "high": 32 },
    "completedAt": "ISO timestamp"
  }
}
```

Do not return S3 keys to a public user unless required.

### POST `/api/admin/scans/:id/playback-url`

Admin-only.

Return a short-lived signed GET URL for the video.

### DELETE `/api/scans/:id`

User-owned or admin-authorized.

Deletion order:

1. Set `status = deletion_requested`.
2. Delete all associated S3 objects.
3. Verify deletion response.
4. Delete or anonymize PII fields.
5. Mark `status = deleted`, set `deleted_at`.
6. Record an audit event without retaining unnecessary personal data.

Make deletion idempotent.

---

## 15. Rekognition age-range analysis

Use `DetectFacesCommand` from `@aws-sdk/client-rekognition`.

Input:

```ts
const command = new DetectFacesCommand({
  Image: {
    S3Object: {
      Bucket: bucket,
      Name: bestFrameObjectKey,
    },
  },
  Attributes: ["ALL"],
});
```

Validation:

```text
FaceDetails length must equal 1
Confidence should be >= 99 where available
AgeRange.Low and AgeRange.High must exist
Low <= High
Values must be between 0 and 120
```

Store:

```text
age_low
age_high
face_confidence
pose
quality
provider = amazon-rekognition
model/version identifier when exposed by the API or application config
analysis timestamp
```

Display:

```text
Estimated age range: 24–32 years
```

Never present the midpoint as a verified age. Never use this estimate alone for alcohol, gambling, legal eligibility, employment, insurance, credit, policing or access-control decisions.

---

## 16. Liveness and spoofing

The custom left/right/up movement challenge provides basic movement verification but is not strong proof that the person is physically present. A replayed video can potentially imitate it.

Expose these two modes in configuration:

```ts
export type LivenessMode = "CUSTOM_CHALLENGE" | "AWS_FACE_LIVENESS";
```

### CUSTOM_CHALLENGE

- Uses the exact center-left-right-up-center sequence.
- Stores video and direction summaries.
- Appropriate for entertainment, surveys and low-risk analytics.
- UI must call it `movement check`, not `secure identity verification`.

### AWS_FACE_LIVENESS

- Use for higher-risk cases requiring stronger spoof resistance.
- Create and retrieve liveness sessions only from the backend.
- Store only required liveness outputs.
- This managed flow may use its own prompts; do not claim that its prompt sequence is the same as the custom sequence.
- The application may run the custom direction scan first and managed liveness second when both business requirements are mandatory.

Do not build a home-grown anti-spoof guarantee.

---

## 17. Admin dashboard

Routes:

```text
/admin/login
/admin/scans
/admin/scans/[sessionId]
/admin/settings/retention
/admin/settings/consent
```

### Scan list

Columns:

- Date/time
- Subject identifier
- Status
- Estimated age range
- Challenge passed
- Duration
- Retention date
- Actions

Filters:

- Date range
- Status
- Age band
- Completed/failed

Use server-side pagination.

### Scan detail

Show:

- Private signed video playback
- Best frame
- Age range
- Five direction results
- Yaw/pitch/roll summaries
- Quality summary
- S3 object metadata
- Consent version and timestamp
- Audit events
- Delete action

Do not show permanent public media URLs.

### Dashboard analytics

Aggregate only what is required:

- Total completed scans
- Failed scans
- Average scan duration
- Age-range bands
- Direction-step failure rates
- Camera permission failure rate
- Upload failure rate

Do not expose individual video on aggregate analytics pages.

---

## 18. Project directory

Use this structure:

```text
app/
  (public)/
    page.tsx
    privacy/page.tsx
    terms/page.tsx
  scan/
    page.tsx
    capture/page.tsx
    [sessionId]/result/page.tsx
  admin/
    login/page.tsx
    scans/page.tsx
    scans/[sessionId]/page.tsx
    settings/retention/page.tsx
    settings/consent/page.tsx
  api/
    scans/
      session/route.ts
      [sessionId]/
        recording-started/route.ts
        upload-urls/route.ts
        complete/route.ts
        status/route.ts
        delete/route.ts
    admin/
      scans/route.ts
      scans/[sessionId]/route.ts
      scans/[sessionId]/playback-url/route.ts
      scans/[sessionId]/retry-analysis/route.ts

components/
  scan/
    FaceScanner.tsx
    CameraPreview.tsx
    FaceGuideOverlay.tsx
    DirectionInstruction.tsx
    ScanProgress.tsx
    QualityMessage.tsx
    UploadProgress.tsx
    ConsentForm.tsx
  admin/
    ScanTable.tsx
    ScanFilters.tsx
    PrivateVideoPlayer.tsx
  ui/

lib/
  aws/
    s3.ts
    rekognition.ts
    presign.ts
  face/
    config.ts
    types.ts
    pose.ts
    quality.ts
    frame-score.ts
    challenge-reducer.ts
  scan/
    api.ts
    media-recorder.ts
    mime.ts
    best-frame.ts
    upload.ts
  supabase/
    browser.ts
    server.ts
    admin.ts
  auth/
    admin.ts
    session-token.ts
  validation/
    scan.ts
  security/
    hash.ts
    rate-limit.ts
  logger/
    index.ts

public/
  models/
    face_landmarker.task
  mediapipe/
    wasm/

supabase/
  migrations/
    0001_face_scan_schema.sql

scripts/
  copy-mediapipe-assets.mjs

middleware.ts
.env.example
README.md
AGENT.md
```

---

## 19. Environment variables

Create `.env.example`:

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=

AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET=
AWS_KMS_KEY_ID=

SCAN_UPLOAD_URL_TTL_SECONDS=300
SCAN_PLAYBACK_URL_TTL_SECONDS=120
SCAN_MAX_VIDEO_BYTES=31457280
SCAN_MAX_IMAGE_BYTES=5242880
SCAN_RETENTION_DAYS=30
SCAN_CONSENT_VERSION=2026-08-v1
SCAN_SESSION_COOKIE_SECRET=

ADMIN_EMAIL_ALLOWLIST=
LIVENESS_MODE=CUSTOM_CHALLENGE
```

Production deployment should prefer an AWS IAM role or workload identity where supported instead of long-lived access keys.

---

## 20. IAM permissions

Create a least-privilege IAM policy limited to the one bucket prefix and required Rekognition actions.

Required S3 operations:

```text
s3:PutObject
s3:GetObject
s3:HeadObject
s3:DeleteObject
```

Required Rekognition operation:

```text
rekognition:DetectFaces
```

If managed Face Liveness is enabled:

```text
rekognition:CreateFaceLivenessSession
rekognition:GetFaceLivenessSessionResults
```

If SSE-KMS is used, add only the necessary KMS permissions for the configured key.

Never grant `s3:*` or `rekognition:*` to the application role.

---

## 21. S3 CORS example

Replace the origins with the exact development and production origins.

```json
[
  {
    "AllowedHeaders": ["content-type", "x-amz-checksum-sha256", "x-amz-server-side-encryption"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://your-production-domain.example"
    ],
    "ExposeHeaders": ["ETag", "x-amz-checksum-sha256"],
    "MaxAgeSeconds": 3000
  }
]
```

Do not use `*` for production origins.

---

## 22. Security controls

Implement all of these:

- Strict input validation with Zod.
- CSRF-aware authenticated/admin mutations.
- `HttpOnly`, `Secure`, `SameSite=Lax` session cookies.
- Rate limiting for session creation and upload URL generation.
- Private S3 bucket with public access blocked.
- Short presigned URL expiry.
- Server-generated keys only.
- File MIME and size checks before and after upload.
- S3 `HeadObject` verification.
- Supabase RLS.
- Admin role authorization on every admin endpoint.
- Security headers through Next.js configuration or middleware.
- Redact S3 signed URLs, tokens and secrets from logs.
- Do not log raw images, video bytes or full PII.
- Audit video access and deletion.
- Configurable retention with automated deletion.
- Error messages must not reveal credentials, bucket internals or stack traces.

Optional production hardening:

- CloudTrail data events for S3 object access.
- AWS WAF or platform-level bot protection.
- Device/session abuse detection.
- SQS-based deletion and analysis retry jobs.
- Antivirus is generally not useful for camera-generated media, but still validate the parser and MIME type before any transcoding pipeline.

---

## 23. Reliability and recovery

Handle these cases explicitly:

```text
Browser has no camera
Camera permission denied
Camera already in use
Unsupported MediaRecorder
Unsupported MIME type
No face
Multiple faces
Face lost during step
Face leaves guide
Low light
Excessive blur
Timeout before completion
User cancels
Recording Blob empty
Upload URL expires
S3 upload interrupted
S3 object metadata mismatch
Best frame missing
Rekognition returns zero faces
Rekognition returns multiple faces
Rekognition age range missing
Database write fails after upload
Deletion partially fails
```

### Orphan cleanup

Create a scheduled cleanup process that:

- Finds sessions stuck in `created`, `recording`, `uploading` or `uploaded` beyond a safe timeout.
- Deletes orphaned S3 objects.
- Marks sessions failed or deleted.
- Deletes objects past `retention_until`.

S3 lifecycle expiration is a second safety layer; application-level deletion remains required for user requests.

---

## 24. Performance requirements

- Scanner page should load only scanner-related packages.
- Dynamically import MediaPipe in a client component.
- Do not send live frames to the backend.
- Perform face landmarks locally.
- Limit inference to approximately 15 FPS.
- Resize only the analysis canvas; preserve original resolution for the best-frame capture.
- Upload media directly to S3 instead of proxying through Vercel.
- Keep route-handler responses small.
- Use server-side pagination in admin.
- Lazy-load video playback only on the detail page.

---

## 25. Accessibility and UX

- Every instruction must be both visual and text-based.
- Do not rely only on color.
- Announce step changes using an `aria-live` region.
- Provide large touch targets.
- Keep instructions short.
- Support keyboard navigation outside the active camera interaction.
- Provide a cancel action at all times.
- Respect reduced-motion preference for decorative animation, but keep functional directional instructions clear.
- Keep the user's face preview large enough on mobile.

Suggested instruction text:

```text
Look straight at the camera
Turn your face slowly to the left
Turn your face slowly to the right
Look upward slowly
Return to the center
```

---

## 26. Testing requirements

### Unit tests

Test:

- Pose matrix conversion
- Mirrored-preview direction mapping
- Every step predicate
- Hold-duration reset logic
- Quality scoring
- Best-frame scoring
- MIME selection
- S3 key generation
- API Zod schemas
- Age-range validation
- Deletion idempotency

### Integration tests

Mock AWS SDK and verify:

- Presigned PUT generation
- S3 `HeadObject` validation
- Rekognition request and parsing
- Database updates through every valid status transition
- Failure state when Rekognition returns multiple faces
- S3 deletion called for every stored asset

### End-to-end tests

Camera E2E tests may use a prerecorded fake-media stream in Chromium test configuration.

Test:

- Consent required before camera access
- Required sequence passes
- `DOWN` is never shown
- Wrong direction does not advance
- Multiple faces block progress
- Successful video/image upload
- Completed age range result
- Admin signed playback
- User deletion

### Manual device matrix

Test on:

- Recent Android Chrome
- Recent iPhone Safari
- Desktop Chrome
- Desktop Edge
- Laptop with low-quality webcam
- Slow mobile network
- Portrait and landscape orientation
- Bright and dim environments

---

## 27. Acceptance criteria

The build is accepted only when all conditions below pass:

1. Camera starts only after explicit consent.
2. No audio is recorded.
3. Scan sequence is exactly center, left, right, up, center.
4. No screen or code path contains a downward-head instruction.
5. Each step requires a stable continuous hold.
6. Multiple faces block the scan.
7. A valid recording is stored in private S3.
8. A best frontal frame is stored in private S3.
9. Postgres stores metadata and S3 keys, not media bytes/base64.
10. Uploads go directly from browser to S3 using short-lived presigned URLs.
11. Backend verifies uploaded objects before analysis.
12. Rekognition analyzes only the best frontal frame.
13. Result is shown as an estimated age range.
14. Admin playback uses a temporary signed GET URL.
15. Public access to S3 objects is impossible.
16. User deletion removes every S3 asset and updates the database.
17. RLS and admin authorization tests pass.
18. Camera-denied, timeout, upload-failure and analysis-failure states have clear UI.
19. The app works on mobile and desktop.
20. No AWS secret, Supabase service-role key or private bucket URL is bundled into client JavaScript.

---

## 28. Implementation phases

Implement in this order. Do not skip ahead and leave earlier phases incomplete.

### Phase 1 — Bootstrap

- Create Next.js TypeScript project.
- Configure Tailwind and shadcn/ui.
- Configure linting, formatting and strict TypeScript.
- Add `.env.example`.

### Phase 2 — Database and auth

- Create Supabase project integration.
- Apply migration.
- Add admin role authorization.
- Add RLS.

### Phase 3 — AWS storage

- Create S3 helper.
- Generate presigned upload and playback URLs.
- Verify objects with `HeadObject`.
- Add delete helper.

### Phase 4 — Scanner MVP

- Camera permission.
- Mirrored preview.
- MediaPipe initialization.
- Face/quality checks.
- Live pose calibration.

### Phase 5 — Direction state machine

- Implement all five steps.
- Add hold logic.
- Add timeout/cancel.
- Add progress UI.
- Confirm no `DOWN` state exists.

### Phase 6 — Recording and best frame

- MediaRecorder.
- MIME fallback.
- Video Blob creation.
- Best-frame selection and crop.

### Phase 7 — Upload and analysis

- Create session.
- Presign assets.
- Direct S3 upload.
- Complete endpoint.
- Rekognition age range.
- Result page.

### Phase 8 — Admin

- Scan list.
- Scan detail.
- Signed video playback.
- Delete and retry.

### Phase 9 — Privacy and retention

- Consent versioning.
- Deletion request.
- Automated cleanup.
- Privacy and terms pages.

### Phase 10 — Tests and deployment

- Unit, integration and E2E tests.
- Production environment variables.
- S3 CORS and encryption.
- Vercel deployment.
- Device testing.

---

## 29. Coding rules for the implementation agent

- Do not leave TODO placeholders in production paths.
- Do not return fake age results.
- Do not mock AWS in production code.
- Do not store permanent signed URLs.
- Do not store base64 media in Postgres.
- Do not expose service credentials client-side.
- Do not silently continue after partial upload failure.
- Do not mark a scan completed until video, best frame and database analysis result are confirmed.
- Do not claim the custom movement challenge is secure liveness.
- Do not add face recognition or identity matching.
- Do not add a downward-look instruction.
- Keep all thresholds in one configuration module.
- Keep pose sign conversion in one adapter module.
- Write errors using stable error codes and user-friendly messages.
- Update the README with setup, AWS, Supabase, local run, tests and deployment instructions.

---

## 30. Required final deliverables

The coding agent must return a complete repository containing:

- Working Next.js application
- Scanner flow
- MediaPipe pose validation
- Video recording
- Direct private S3 uploads
- Supabase SQL migration
- Rekognition age-range integration
- Admin dashboard
- Deletion flow
- Privacy/consent pages
- Tests
- `.env.example`
- Setup README
- No missing core files
- No placeholder API responses

The implementation is not complete until a real end-to-end scan can be performed on a mobile browser, uploaded to private S3, analyzed through Rekognition, displayed as an age range and reviewed/deleted through the admin dashboard.
