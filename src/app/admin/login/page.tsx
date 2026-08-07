"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError("Invalid email or password.");
        return;
      }
      router.push("/admin/scans");
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Could not sign in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#fcfaf7] px-4 py-8">
      <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#e9dfcf] opacity-70 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -left-20 h-80 w-80 rounded-full bg-[#dce5da] opacity-70 blur-3xl" />
      <Card className="admin-card relative w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[#351d0f] font-serif text-xl italic text-[#f8f0e3]">S</div>
          <CardTitle className="mt-2 font-serif text-3xl font-medium text-[#3c2718]">Welcome back</CardTitle>
          <CardDescription>
            Sign in to review and manage scan records.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full rounded-full">
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
