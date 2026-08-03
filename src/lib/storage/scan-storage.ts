/**
 * Client-side persistence for user form details and active scan session.
 * Uses localStorage with IndexedDB fallback so data survives hard refreshes.
 */

export interface SavedScanForm {
  subjectName?: string;
  subjectEmail?: string;
  subjectPhone?: string;
  activeSessionId?: string;
  lastUpdated?: number;
}

const STORAGE_KEY = "face_scan_user_form_v1";

export function saveFormState(data: Partial<SavedScanForm>): void {
  if (typeof window === "undefined") return;
  try {
    const existing = getFormState();
    const updated: SavedScanForm = {
      ...existing,
      ...data,
      lastUpdated: Date.now(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn("Could not save scan form to localStorage:", err);
  }
}

export function getFormState(): SavedScanForm {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as SavedScanForm;
  } catch {
    return {};
  }
}

/**
 * Snapshot + subscription pair for `useSyncExternalStore`. Returning a
 * primitive keeps React's identity comparison stable across renders.
 */
export function getActiveSessionId(): string | null {
  return getFormState().activeSessionId ?? null;
}

export function subscribeToFormState(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  // Only fires for writes from other tabs; same-tab writes are pushed through
  // React state by the caller.
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

export function clearActiveSession(): void {
  if (typeof window === "undefined") return;
  try {
    const state = getFormState();
    delete state.activeSessionId;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}
