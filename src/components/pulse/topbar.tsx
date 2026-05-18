import Link from "next/link";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/performance", label: "Performance" },
  { href: "/positions", label: "Positions" },
  { href: "/dividends", label: "Dividends" },
  { href: "/tax/2025", label: "Tax 2025" },
  { href: "/upload", label: "Upload" },
];

export function Topbar({ active, user }: { active: string; user: { name?: string | null; image?: string | null } | null }) {
  return (
    <header className="flex items-center gap-6 mb-7">
      <Link href="/" className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-[10px] bg-mint text-bg font-mono font-bold flex items-center justify-center">◐</span>
        <span className="font-sans font-bold text-lg tracking-tight">folio<span className="text-mint">.</span></span>
      </Link>
      <nav className="flex gap-1 ml-4">
        {NAV.map(n => {
          const key = n.label.toLowerCase().split(' ')[0];
          const isActive = active === key;
          return (
            <Link
              key={n.href}
              href={n.href as never}
              className={`px-3.5 py-2 rounded-[10px] text-[13px] font-medium ${isActive ? "text-ink bg-panel2" : "text-muted hover:text-ink"}`}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <div className="w-9 h-9 rounded-[10px] bg-amber text-bg font-bold flex items-center justify-center">
          {(user?.name ?? "U").slice(0, 2).toUpperCase()}
        </div>
      </div>
    </header>
  );
}
