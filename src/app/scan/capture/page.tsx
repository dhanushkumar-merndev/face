"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConsentForm, type ConsentValues } from "@/components/scan/ConsentForm";
import { FaceScanner } from "@/components/scan/FaceScanner";
import { scanApi } from "@/lib/scan/api";
import { saveFormState, getFormState, clearActiveSession } from "@/lib/storage/scan-storage";

/**
 * Consent gate -> camera permission -> full-screen guided capture.
 * Automatically restores active scan session on hard refresh using state initializer.
 */
export default function ScanCapturePage() {
  const router = useRouter();

  // Lazy state initializers read from client storage directly during initial render,
  // avoiding synchronous setState calls inside useEffect.
  const [sessionId, setSessionId] = useState<string | null>(() => {
    return getFormState().activeSessionId ?? null;
  });
  const [consented, setConsented] = useState<boolean>(() => {
    return Boolean(getFormState().activeSessionId);
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setSessionId(newSid);
      setConsented(true);
    } catch (err) {
      console.error(err);
      setError("Could not start the scan. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleComplete = ({ sessionId: sid }: { sessionId: string }) => {
    clearActiveSession();
    router.push(`/scan/${sid}/result`);
  };

  const handleExit = () => {
    clearActiveSession();
    router.push("/");
  };

  if (!consented) {
    return (
      <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-slate-950 px-4 py-10">
        <div className="scan-grid pointer-events-none absolute inset-0 opacity-20" aria-hidden="true" />
        <div className="pointer-events-none absolute left-1/2 top-0 h-[38rem] w-[38rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/15 blur-[120px]" />
        <div className="relative z-10 w-full max-w-lg">
          <ConsentForm onConsent={handleConsent} busy={busy} />
          {error && (
            <p className="mt-4 text-center text-sm text-rose-400" role="alert">
              {error}
            </p>
          )}
        </div>
      </main>
    );
  }

  return (
    <FaceScanner
      sessionId={sessionId ?? undefined}
      onResult={handleComplete}
      onExit={handleExit}
    />
  );
}
