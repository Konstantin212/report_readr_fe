import { BarChart3, FileUp, Home, Landmark, Settings, WalletCards } from "lucide-react";
import Link from "next/link";

import { SignOutButton } from "@/components/app/sign-out-button";
import { requireCurrentUser } from "@/lib/auth/server";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/imports", label: "Imports", icon: FileUp },
  { href: "/portfolio", label: "Portfolio", icon: WalletCards },
  { href: "/tax/2024", label: "Tax", icon: Landmark },
  { href: "/settings", label: "Settings", icon: Settings },
];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await requireCurrentUser();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/82 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/dashboard" className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <BarChart3 size={20} aria-hidden />
            </span>
            <span>
              <span className="block text-sm font-semibold">Portfolio Tax</span>
              <span className="block text-xs text-muted-foreground">Private cockpit</span>
            </span>
          </Link>
          <nav aria-label="Primary navigation" className="hidden items-center gap-1 rounded-md bg-card/70 p-1 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <item.icon size={16} aria-hidden />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="hidden text-right text-xs text-muted-foreground sm:block">
            <span className="block text-foreground">{user?.name ?? user?.email ?? "Not signed in"}</span>
            <span>{user.email}</span>
            <div className="mt-1 flex justify-end">
              <SignOutButton />
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-5 rounded-md border border-border bg-card/95 p-1 shadow-panel backdrop-blur-xl md:hidden"
      >
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex min-h-12 flex-col items-center justify-center gap-1 rounded-md text-[11px] text-muted-foreground",
              "transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <item.icon size={17} aria-hidden />
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
