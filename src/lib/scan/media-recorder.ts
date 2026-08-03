import { pickMimeType, extensionForMime } from "./mime";

/**
 * MediaRecorder helpers. Chunks are collected by the caller; the final Blob is
 * assembled from them when recording stops. No audio is recorded.
 */

export interface RecordingSession {
  blob: Blob;
  mimeType: string;
  extension: string;
}

/**
 * Create a MediaRecorder for a video-only stream. Returns the recorder plus a
 * `chunks` array the caller owns — push every `dataavailable` Blob into it and
 * read the assembled Blob via `finalizeRecording`.
 */
export function createRecorder(
  stream: MediaStream
): { recorder: MediaRecorder; chunks: Blob[]; mimeType: string; extension: string } {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is not supported in this browser.");
  }

  const mime = pickMimeType((m) => MediaRecorder.isTypeSupported(m));
  const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  const chunks: Blob[] = [];

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  return {
    recorder,
    chunks,
    mimeType: recorder.mimeType || mime || "",
    extension: extensionForMime(recorder.mimeType || mime),
  };
}

export function startRecording(recorder: MediaRecorder): void {
  recorder.start(1000);
}

export function stopRecording(recorder: MediaRecorder): Promise<RecordingSession> {
  return new Promise((resolve, reject) => {
    if (recorder.state === "inactive") {
      reject(new Error("Recorder is already inactive."));
      return;
    }

    const chunks: Blob[] = [];
    const originalOnData = recorder.ondataavailable;
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
      originalOnData?.call(recorder, event);
    };

    recorder.onstop = () => {
      const type = recorder.mimeType || "";
      resolve({
        blob: new Blob(chunks, { type }),
        mimeType: type,
        extension: extensionForMime(type),
      });
    };
    recorder.onerror = () => reject(new Error("MediaRecorder failed during recording."));

    recorder.stop();
  });
}
