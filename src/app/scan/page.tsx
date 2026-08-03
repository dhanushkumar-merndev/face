import { redirect } from "next/navigation";

export const metadata = {
  title: "Face Scan — Age Range Check",
};

export default function ScanPage() {
  // The scan flow starts at /scan/capture (consent gate); the result page is
  // addressed by session id. Redirect users to the capture entry point.
  redirect("/scan/capture");
}
