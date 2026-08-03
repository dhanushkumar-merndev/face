import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Age Range Scan",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      <h1 className="text-3xl font-bold">Privacy Policy</h1>
      <section className="flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground">What we collect</h2>
        <p>
          When you run a face scan we record a short video selfie (no audio) and capture one best
          frontal image. The recording is used only to verify the required head movements
          (center, left, right, up, return to center) and to produce an estimated age range. We do
          not perform face recognition, face matching, or identity verification, and we do not
          build a face collection.
        </p>

        <h2 className="text-lg font-semibold text-foreground">How it is stored</h2>
        <p>
          Your video and image are uploaded directly from your browser to a private, encrypted
          Amazon S3 bucket using short-lived presigned URLs. The database stores only metadata,
          scan results and object keys — never the media bytes.
        </p>

        <h2 className="text-lg font-semibold text-foreground">Retention</h2>
        <p>
          Scans are retained for 30 days by default, after which they are automatically deleted.
          You may request deletion at any time from the result page, and we remove the media and
          database record.
        </p>

        <h2 className="text-lg font-semibold text-foreground">The age estimate</h2>
        <p>
          The estimated age range is approximate and may be inaccurate. It is not proof of age and
          must not be used for legal eligibility, alcohol, gambling, employment, insurance, credit,
          policing or access-control decisions.
        </p>

        <h2 className="text-lg font-semibold text-foreground">Who can access your scan</h2>
        <p>
          Only authorized administrators can review scans. Administrators view media through
          temporary signed URLs; there are no public media links.
        </p>

        <h2 className="text-lg font-semibold text-foreground">Withdrawal and deletion</h2>
        <p>
          You can stop a scan at any time with the cancel button, and you can request deletion of
          your data from the result page or by contacting us. Deletion is processed automatically
          and is irreversible.
        </p>
      </section>
    </main>
  );
}
