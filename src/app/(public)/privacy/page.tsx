import Link from "next/link";
import type { Metadata } from "next";
import { Camera, Lock, ScanFace, Trash2 } from "lucide-react";

export const metadata: Metadata = { title: "Privacy Policy — Skin Age" };

const updated = "6 August 2026";

/** The short version, kept at the top so it is read before the full policy. */
const AT_A_GLANCE = [
  { icon: Camera, text: "Front camera only — no audio is recorded." },
  { icon: Lock, text: "Clips are stored encrypted and deleted after 30 days." },
  { icon: ScanFace, text: "Never used for face recognition or identity matching." },
  { icon: Trash2, text: "You can delete everything whenever you want." },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-[#fcfaf7] px-4 py-10 sm:px-6 sm:py-16">
      <article className="mx-auto max-w-4xl">
        <Link href="/" className="text-sm font-medium text-[#9d6a35] hover:underline">← Back to Skin Age</Link>
        <header className="mt-8 border-b border-[#eadbca] pb-8">
          <p className="admin-eyebrow">Your privacy</p>
          <h1 className="admin-heading mt-3">Privacy Policy</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[#6d5543]">
            This policy explains what happens to your information when you use Skin Age, including
            your short face scan, the resulting estimates, and the choices available to you.
          </p>
          <p className="mt-4 text-sm text-[#8b735f]">Last updated: {updated}</p>
        </header>

        <section className="mt-10 rounded-2xl border border-[#eadbca] bg-white p-6 shadow-[0_12px_32px_rgba(72,43,24,0.055)] sm:p-8">
          <h2 className="admin-eyebrow">At a glance</h2>
          <ul className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {AT_A_GLANCE.map((item) => (
              <li key={item.text} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#f0e0cd] bg-[#faf1e6] text-[#a9703e]">
                  <item.icon className="h-4 w-4" />
                </span>
                <span className="text-[15px] leading-6 text-[#624d3d]">{item.text}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-sm leading-6 text-[#8b735f]">
            These are summaries. The sections below are the terms that actually apply.
          </p>
        </section>

        <div className="mt-10 space-y-10 text-[15px] leading-7 text-[#624d3d]">
          <PolicySection title="1. Who this policy applies to">
            <p>This policy applies when you visit Skin Age, start a scan, view a result, ask us to delete a scan, or contact us about privacy. It covers the information processed through this website and the private systems that support it.</p>
            <p>Skin Age is intended for adults. By starting a scan, you confirm that you are 18 or older. Do not use the service to scan another person unless you have the authority and consent required to do so.</p>
          </PolicySection>

          <PolicySection title="2. Information we collect">
            <p>When you choose to start a scan, we collect the details you enter in the form, such as your name, email address and phone number. We also record three short video clips without audio and capture still images from the scan. The clips guide the required head movements and support the scan process.</p>
            <p>We generate scan-related information such as completion status, timestamps, image-quality signals, approximate age-range output, cosmetic skin-reading output, and technical logs needed to keep the service secure and reliable. We may also process device, browser, network and error information that is normally provided when a website is used.</p>
          </PolicySection>

          <PolicySection title="3. How we use your scan data">
            <p>We use your video clips and captured images to run the scan, check that the required movements were completed, produce the results shown to you, prevent misuse, troubleshoot errors and respond to a deletion request. The service does not perform face recognition, face matching, face searching, or identity verification. We do not create a facial-recognition database or a face collection.</p>
            <p>The estimates are approximate. They are for personal skincare curiosity and low-risk analytics only. They are not medical advice, a diagnosis, identity verification, or proof of a person&apos;s age.</p>
          </PolicySection>

          <PolicySection title="4. Research, development and service improvement">
            <p>We may use de-identified and aggregated scan insights for research and development purposes. This helps us understand whether the scan flow is working well, improve image-quality checks, test reliability, strengthen security, and develop better product features.</p>
            <p>Where practical, improvement work uses statistics, quality metrics and information that has been separated from direct contact details. We do not use the service to identify you or to make decisions about your employment, insurance, credit, access to housing, education, law enforcement, or eligibility for age-restricted products or services.</p>
          </PolicySection>

          <PolicySection title="5. How results should and should not be used">
            <p>Do not rely on a scan result as a verified age, health assessment or professional skincare recommendation. Results can be wrong because lighting, camera quality, image quality, facial pose and model limitations can affect them.</p>
            <p>Skin Age must not be used to make legal, medical, financial, employment, insurance, credit, policing, immigration, housing, gambling, alcohol, access-control or other high-impact decisions about a person.</p>
          </PolicySection>

          <PolicySection title="6. Storage and security">
            <p>Scan media is sent directly from your browser to a private storage location using short-lived upload links. Media is not made publicly available. Our database stores the associated metadata, results and storage references instead of the video or image bytes themselves.</p>
            <p>Access to scan records is restricted to authorised administrators who need it for operating, supporting or protecting the service. When an administrator needs to view private media, access is delivered through a short-lived signed link. No security system can promise absolute protection, but we use reasonable technical and organisational measures designed to reduce the risk of unauthorised access, loss or misuse.</p>
          </PolicySection>

          <PolicySection title="7. Service providers">
            <p>We use specialist providers to host the application, store private scan media, maintain the database, and process permitted analysis requests. These providers may process information only to provide their services to us and subject to their contractual and security obligations. Depending on the configuration of the service, a captured frame may be sent to an external AI provider for the cosmetic skin-reading feature.</p>
            <p>We do not sell your personal information or rent your scan media to third parties for their independent marketing purposes.</p>
          </PolicySection>

          <PolicySection title="8. Cookies and local storage">
            <p>We use a small number of strictly functional cookies. When you start a scan, we set a session cookie that holds a random token linking your browser to that scan so the capture, upload and result steps belong to the same session. Administrators of the private review area get a separate sign-in cookie. These cookies are HTTP-only, restricted to this site, and expire on their own; they carry no advertising identifier.</p>
            <p>Your browser also keeps a small record in local storage on your own device. It holds the details you typed into the scan form, such as name, email and phone number, together with the identifier of your active scan, so a refresh or a dropped connection does not lose your progress. That record stays on your device, is never used for tracking, and is removed when you clear your browsing data for this site.</p>
            <p>We do not use advertising cookies, cross-site tracking pixels or third-party marketing trackers, and we do not sell information gathered through cookies. If we later add optional analytics that are not strictly necessary, we will ask for consent where the law requires it and update this section first.</p>
          </PolicySection>

          <PolicySection title="9. Retention and deletion">
            <p>Scan media and the related record are retained for the period shown in the service, which is 30 days by default unless a different period is clearly stated. We use retention controls and storage lifecycle rules to help remove information after that period.</p>
            <p>You can request deletion from the result page or by contacting us. A deletion request removes the associated video, still images and database record where technically possible. Some limited security or audit records may remain for a short period where required to protect the service, comply with law, or document that a request was processed.</p>
          </PolicySection>

          <PolicySection title="10. Your choices and rights">
            <p>You can choose not to start a scan, stop a scan before completion, decline to provide optional information where the form allows it, or ask us to delete your data. Depending on where you live, you may also have rights to request access, correction, deletion, restriction, objection or a copy of your personal information.</p>
            <p>To make a request, use the deletion control on the result page or contact the team using the details provided with the service. We may need to verify that a request relates to the relevant scan before acting on it.</p>
          </PolicySection>

          <PolicySection title="11. International processing">
            <p>Our service providers may process information in countries other than the one in which you live. When this happens, we take reasonable steps to use appropriate safeguards required by applicable law. The protections described in this policy apply wherever your information is processed for this service.</p>
          </PolicySection>

          <PolicySection title="12. Children and sensitive use cases">
            <p>Skin Age is not designed for children, and we do not knowingly collect scan data from anyone under 18. If you believe a child has used the service, please contact us so that we can review and delete the information.</p>
            <p>Please do not use this service during an emergency or as a substitute for medical care. If you have a health or skin concern, seek advice from a qualified healthcare professional.</p>
          </PolicySection>

          <PolicySection title="13. Changes to this policy">
            <p>We may update this policy when the service, our practices or applicable requirements change. We will post the updated version here and change the “Last updated” date. If a change materially affects how we use scan data, we will take additional steps to notify users when required.</p>
          </PolicySection>

          <PolicySection title="14. Contact and complaints">
            <p>If you have a question, request or concern about privacy, please contact us through the support channel provided in the service. You may also have the right to contact your local data-protection authority if you are unhappy with how we handle your information.</p>
          </PolicySection>
        </div>
      </article>
    </main>
  );
}

function PolicySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-serif text-2xl font-semibold tracking-tight text-[#3c2718]">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}
