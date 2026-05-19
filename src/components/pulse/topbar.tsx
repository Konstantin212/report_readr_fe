import Link from "next/link";
import { BrokerFilter } from "@/components/pulse/broker-filter";
import { TopbarNav } from "@/components/pulse/topbar-nav";

export function Topbar({ user }: { user: { name?: string | null; image?: string | null } | null }) {
  return (
    <header className="flex items-center gap-6 mb-7">
      <Link href="/" className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-[10px] bg-mint text-bg font-mono font-bold flex items-center justify-center">◐</span>
        <span className="font-sans font-bold text-lg tracking-tight">folio<span className="text-mint">.</span></span>
      </Link>
      <TopbarNav />
      <div className="ml-auto flex items-center gap-2">
        <BrokerFilter />
        <div className="w-9 h-9 rounded-[10px] bg-amber text-bg font-bold flex items-center justify-center">
          {(user?.name ?? "U").slice(0, 2).toUpperCase()}
        </div>
      </div>
    </header>
  );
}
