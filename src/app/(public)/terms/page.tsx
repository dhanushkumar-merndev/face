import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Age Range Scan",
};

export default function TermsPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      <h1 className="text-3xl font-bold">Terms of Service</h1>
      <section className="flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground">Acceptance</h2>
        <p>
          By starting a face scan you confirm that you are at least 18 years old, that you consent
          to a short video selfie being recorded, and that you understand the age estimate is
          approximate.
        </p>

        <h2 className="text-lg font-semibold text-foreground">Use of the service</h2>
        <p>
          This service estimates an approximate age range from a short face scan. It is provided
          for entertainment and low-risk analytics only. It must not be used for identity
          verification, legal eligibility decisions, or any purpose where a precise or verified age
          is required.
        </p>

        <h2 className="text-lg font-semibold text-foreground">Your data</h2>
        <p>
          You can request deletion of your video, image and database record at any time. See the{" "}
          <a href="/privacy" className="underline">
            Privacy Policy
          </a>{" "}
          for details on storage, retention and access.
        </p>

        <h2 className="text-lg font-semibold text-foreground">No guarantees</h2>
        <p>
          The age estimate may be inaccurate and should not be relied upon for any legal or
          commercial purpose. The service is provided &quot;as is&quot; without warranties of any
          kind.
        </p>
      </section>
    </main>
  );
}
