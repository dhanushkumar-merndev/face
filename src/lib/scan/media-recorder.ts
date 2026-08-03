import { pickMimeType, extensionForMime } from "./mime";

/**
 * MediaRecorder helpers. One recorder is created per capture direction: it
 * starts when the user reaches the pose and stops when the hold completes, so
 * each direction yields its own short, self-contained video segment.
 *
 * The chunk array is owned by the recorder object and shared by the
 * `dataavailable` handler and `stop()`, so the assembled Blob always contains
 * every chunk — including those emitted before `stop()` was called.
 */

export interface RecordingSession {
  blob: Blob;
  mimeType: string;
  extension: string;
  durationMs: number;
}

export interface SegmentRecorder {
  readonly recorder: MediaRecorder;
  readonly mimeType: string;
  readonly extension: string;
  /** Stops recording and resolves with the assembled segment. */
  stop(): Promise<RecordingSession>;
  /** Aborts without producing a segment (cancel / unmount). */
  abort(): void;
}

/**
 * Creates and immediately starts a video-only recorder for one direction.
 */
export function startSegmentRecorder(stream: MediaStream): SegmentRecorder {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is not supported in this browser.");
  }

  const mime = pickMimeType((m) => MediaRecorder.isTypeSupported(m));
  const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  const chunks: Blob[] = [];
  const startedAt = performance.now();

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };

  // A timeslice keeps memory bounded and guarantees at least one chunk even if
  // the segment is stopped very quickly.
  recorder.start(500);

  const resolvedMime = recorder.mimeType || mime || "";

  const assemble = (): RecordingSession => {
    const type = recorder.mimeType || resolvedMime;
    return {
      blob: new Blob(chunks, { type }),
      mimeType: type,
      extension: extensionForMime(type),
      durationMs: Math.round(performance.now() - startedAt),
    };
  };

  return {
    recorder,
    mimeType: resolvedMime,
    extension: extensionForMime(resolvedMime),
    stop() {
      return new Promise<RecordingSession>((resolve, reject) => {
        if (recorder.state === "inactive") {
          resolve(assemble());
          return;
        }
        recorder.onstop = () => resolve(assemble());
        recorder.onerror = () => reject(new Error("MediaRecorder failed during recording."));
        recorder.stop();
      });
    },
    abort() {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      if (recorder.state !== "inactive") recorder.stop();
      chunks.length = 0;
    },
  };
}
