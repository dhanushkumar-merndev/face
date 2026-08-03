"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConsentForm, type ConsentValues } from "@/components/scan/ConsentForm";
import { FaceScanner } from "@/components/scan/FaceScanner";
import { scanApi } from "@/lib/scan/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Page 2/3/4/5: consent gate -> camera permission -> guided scan -> upload.
 * The camera is NOT started before consent.
 */
export default function ScanCapturePage() {
  const router = useRouter();
  const [consented, setConsented] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
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
      setSessionId(res.data.sessionId);
      setConsented(true);
    } catch (err) {
      console.error(err);
      setError("Could not start the scan. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!consented) {
    return (
      <main className="flex min-h-[80vh] flex-col items-center justify-center gap-4 px-4 py-10">
        <ConsentForm onConsent={handleConsent} busy={busy} />
        {error && <p className="text-sm text-red-600">{error}</p>}
      </main>
    );
  }

  return (
    <main className="flex min-h-[80vh] flex-col items-center justify-center gap-4 px-4 py-10">
      <FaceScanner
        sessionId={sessionId ?? undefined}
        onResult={({ sessionId: sid }) => {
          router.push(`/scan/${sid}/result`);
        }}
      />
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-base">Preparation tips</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          <p>• Remove anything blocking your face (mask, glasses glare)</p>
          <p>• Use even lighting</p>
          <p>• Keep only one person in view</p>
          <p>• Hold the device steady</p>
          <p>• Do not use beauty filters</p>
        </CardContent>
      </Card>
      <Button variant="ghost" onClick={() => router.push("/")}>
        Cancel scan
      </Button>
    </main>
  );
}
