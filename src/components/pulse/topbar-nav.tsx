"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Dashboard", match: (p: string) => p === "/" },
  { href: "/performance", label: "Performance", match: (p: string) => p.startsWith("/performance") },
  { href: "/positions", label: "Positions", match: (p: string) => p.startsWith("/positions") },
  { href: "/dividends", label: "Dividends", match: (p: string) => p.startsWith("/dividends") },
  { href: "/tax/2025", label: "Tax 2025", match: (p: string) => p.startsWith("/tax") },
  { href: "/upload", label: "Upload", match: (p: string) => p.startsWith("/upload") },
] as const;

export function TopbarNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 ml-4">
      {NAV.map((n) => {
        const isActive = n.match(pathname);
        return (
          <Link
            key={n.href}
            href={n.href as never}
            className={`px-3.5 py-2 rounded-[10px] text-[13px] font-medium ${
              isActive ? "text-ink bg-panel2" : "text-muted hover:text-ink"
            }`}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
