"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { trackNavLinkClicked } from "@/lib/analytics-events";

export function TopbarNav() {
  const pathname = usePathname();
  // Tax link defaults to the current calendar year. The tax page itself
  // hosts a year selector to switch to other years with data.
  const currentYear = new Date().getFullYear();
  const NAV = [
    { href: "/", label: "Dashboard", destination: "dashboard", match: (p: string) => p === "/" },
    { href: "/performance", label: "Performance", destination: "performance", match: (p: string) => p.startsWith("/performance") },
    { href: "/positions", label: "Positions", destination: "positions", match: (p: string) => p.startsWith("/positions") },
    { href: "/crypto", label: "Crypto", destination: "crypto", match: (p: string) => p.startsWith("/crypto") },
    { href: "/dividends", label: "Dividends", destination: "dividends", match: (p: string) => p.startsWith("/dividends") },
    { href: `/tax/${currentYear}`, label: "Tax", destination: "tax", match: (p: string) => p.startsWith("/tax") },
    { href: "/upload", label: "Upload", destination: "upload", match: (p: string) => p.startsWith("/upload") },
  ] as const;
  return (
    <nav className="hidden lg:flex gap-1 ml-4">
      {NAV.map((n) => {
        const isActive = n.match(pathname);
        return (
          <Link
            key={n.href}
            href={n.href as never}
            onClick={() => trackNavLinkClicked(n.destination)}
            className={`px-3 py-2 rounded-[10px] text-[13px] font-medium ${
              isActive ? "bg-panel2 text-ink" : "text-muted hover:text-ink"
            }`}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
