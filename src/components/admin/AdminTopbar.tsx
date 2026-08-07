"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutList, LogOut } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navigation = [{ href: "/admin/scans", label: "Scans", icon: LayoutList }];

export function AdminTopbar() {
  const pathname = usePathname();
  const router = useRouter();

  const signOut = async () => {
    await createSupabaseBrowserClient().auth.signOut();
    router.replace("/admin/login");
    router.refresh();
  };

  return (
    <header className="border-b border-[#eadbca] bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/admin/scans" aria-label="Skin Age Admin home">
            <span className="grid h-9 w-9 place-items-center rounded-full border border-[#e2cba9] bg-white font-serif text-lg italic text-[#9d6a35] shadow-sm">S</span>
          </Link>
        </div>

        <nav className="flex items-center gap-1 overflow-x-auto pb-0.5" aria-label="Admin navigation">
          {navigation.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href === "/admin/scans" && pathname.startsWith("/admin/scans"));
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "border border-[#e4cdb4] bg-[#fbf2e8] text-[#3c2718] shadow-sm"
                    : "border border-transparent text-stone-600 hover:bg-[#fbf2e8] hover:text-[#3c2718]"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Link>
            );
          })}
          <Button variant="ghost" size="sm" className="ml-1 shrink-0 text-stone-600 hover:bg-[#fbf2e8] hover:text-[#3c2718]" onClick={signOut}>
            <LogOut className="h-3.5 w-3.5" />
            <span className="sm:hidden">Sign out</span>
          </Button>
        </nav>
      </div>
    </header>
  );
}
