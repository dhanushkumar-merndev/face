import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = {
  title: "Age Range Scan",
  description: "A short, privacy-first face scan that estimates an approximate age range.",
};

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-3xl">
        <Card className="border-0 shadow-none">
          <CardHeader className="items-center text-center">
            <CardTitle className="text-4xl font-bold tracking-tight sm:text-5xl">
              Estimate an age range in seconds
            </CardTitle>
            <CardDescription className="max-w-xl text-base">
              A short face scan (10–20 seconds) that checks your head movements and returns an
              approximate age range. No account needed. Your media is stored securely and deleted
              automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6">
            <Button asChild size="lg" className="h-14 px-10 text-base">
              <Link href="/scan/capture">Start scan</Link>
            </Button>
            <ul className="grid w-full max-w-xl grid-cols-1 gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              <li>• Front camera only — no audio</li>
              <li>• Five simple head movements</li>
              <li>• Approximate age range result</li>
              <li>• Private encrypted storage, 30-day retention</li>
              <li>• Delete your data at any time</li>
              <li>• Never used for identity matching</li>
            </ul>
            <p className="text-center text-xs text-muted-foreground">
              By starting a scan you agree to our{" "}
              <Link href="/privacy" className="underline">
                Privacy Policy
              </Link>{" "}
              and{" "}
              <Link href="/terms" className="underline">
                Terms
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
