"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function TopbarNav() {
  const pathname = usePathname();
  // Tax link defaults to the current calendar year. The tax page itself
  // hosts a year selector to switch to other years with data.
  const currentYear = new Date().getFullYear();
  const NAV = [
    { href: "/", label: "Dashboard", match: (p: string) => p === "/" },
    { href: "/performance", label: "Performance", match: (p: string) => p.startsWith("/performance") },
    { href: "/positions", label: "Positions", match: (p: string) => p.startsWith("/positions") },
    { href: "/dividends", label: "Dividends", match: (p: string) => p.startsWith("/dividends") },
    { href: `/tax/${currentYear}`, label: "Tax", match: (p: string) => p.startsWith("/tax") },
    { href: "/upload", label: "Upload", match: (p: string) => p.startsWith("/upload") },
  ] as const;
  return (
    <nav className="hidden lg:flex gap-1 ml-4">
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
