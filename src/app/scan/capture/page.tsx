"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ConsentForm, type ConsentValues } from "@/components/scan/ConsentForm";
import { FaceScanner } from "@/components/scan/FaceScanner";
import { scanApi } from "@/lib/scan/api";
import {
  saveFormState,
  clearActiveSession,
  getActiveSessionId,
  subscribeToFormState,
} from "@/lib/storage/scan-storage";

/**
 * Consent gate -> camera permission -> full-screen guided capture.
 * An interrupted scan is restored from client storage on a hard refresh.
 */
export default function ScanCapturePage() {
  const router = useRouter();

  // Storage exists only on the client, so the server snapshot is always null:
  // both the server HTML and the client's hydration pass render the consent
  // form, and React swaps in the restored session immediately afterwards.
  // Reading storage during the initial render instead would make the two
  // passes disagree and fail hydration.
  const restoredSessionId = useSyncExternalStore(
    subscribeToFormState,
    getActiveSessionId,
    () => null
  );

  // Session started in this tab. Also pins the scanner in place while we
  // navigate away, since leaving clears the stored session.
  const [ownSessionId, setOwnSessionId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionId = ownSessionId ?? restoredSessionId;

  const handleConsent = async (values: ConsentValues) => {
    setBusy(true);
    setError(null);
    try {
      const res = await scanApi.createSession({
        subjectName: values.subjectName?.trim() || undefined,
        subjectEmail: values.subjectEmail?.trim() || undefined,
        subjectPhone: values.subjectPhone?.trim() || undefined,
        consentGiven: values.consentGiven,
        adultDeclaration: values.adultDeclaration,
        consentVersion: process.env.NEXT_PUBLIC_SCAN_CONSENT_VERSION ?? "2026-08-v1",
      });
      if (!res.success) {
        setError(res.error.message);
        return;
      }
      const newSid = res.data.sessionId;
      saveFormState({ activeSessionId: newSid });
      setOwnSessionId(newSid);
    } catch (err) {
      console.error(err);
      setError("Could not start the scan. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleComplete = ({ sessionId: sid }: { sessionId: string }) => {
    setLeaving(true);
    clearActiveSession();
    router.push(`/scan/${sid}/result`);
  };

  const handleExit = () => {
    setLeaving(true);
    clearActiveSession();
    router.push("/");
  };

  // Neutral surface while the route transition is in flight, so clearing the
  // stored session does not flash the consent form on the way out.
  if (leaving) {
    return (
      <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[#fcfaf7] px-4 py-10">
      </main>
    );
  }

  if (!sessionId) {
    return (
      <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[#fcfaf7] px-4 py-10">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[38rem] w-[38rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#e4c49e]/35 blur-[120px]" />
        <div className="relative z-10 w-full max-w-lg">
          <ConsentForm onConsent={handleConsent} busy={busy} />
          {error && (
            <p className="mt-4 text-center text-sm text-[#9e3d3d]" role="alert">
              {error}
            </p>
          )}
        </div>
      </main>
    );
  }

  return <FaceScanner sessionId={sessionId} onResult={handleComplete} onExit={handleExit} />;
}
