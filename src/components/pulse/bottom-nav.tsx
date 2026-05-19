"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, TrendingUp, Wallet, Coins, Receipt, Upload } from "lucide-react";

export function BottomNav() {
  const pathname = usePathname();
  const currentYear = new Date().getFullYear();
  const NAV = [
    { href: "/", label: "Dash", Icon: LayoutDashboard, match: (p: string) => p === "/" },
    { href: "/performance", label: "Perf", Icon: TrendingUp, match: (p: string) => p.startsWith("/performance") },
    { href: "/positions", label: "Pos", Icon: Wallet, match: (p: string) => p.startsWith("/positions") },
    { href: "/dividends", label: "Div", Icon: Coins, match: (p: string) => p.startsWith("/dividends") },
    { href: `/tax/${currentYear}`, label: "Tax", Icon: Receipt, match: (p: string) => p.startsWith("/tax") },
    { href: "/upload", label: "Up", Icon: Upload, match: (p: string) => p.startsWith("/upload") },
  ] as const;
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-bg/95 backdrop-blur border-t border-border">
      <div className="max-w-[1320px] mx-auto flex justify-around items-stretch">
        {NAV.map((n) => {
          const isActive = n.match(pathname);
          const { Icon } = n;
          return (
            <Link
              key={n.href}
              href={n.href as never}
              className={`flex-1 min-h-[56px] flex flex-col items-center justify-center gap-1 py-2 ${
                isActive ? "text-mint bg-panel2/50" : "text-muted hover:text-ink"
              }`}
            >
              <Icon className="w-5 h-5" strokeWidth={2} />
              <span className="font-mono text-[10px] uppercase tracking-widest">{n.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
