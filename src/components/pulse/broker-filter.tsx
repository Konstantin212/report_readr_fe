"use client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

const BROKERS = [
  { key: "all", label: "All" },
  { key: "ff", label: "Freedom" },
  { key: "ibkr", label: "IBKR" },
] as const;

export function BrokerFilter({ active = "all" }: { active?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (
    <div className="flex gap-0.5 p-[3px] rounded-full bg-panel border border-border">
      {BROKERS.map((b) => (
        <button
          key={b.key}
          onClick={() => {
            const p = new URLSearchParams(sp.toString());
            p.set("broker", b.key);
            router.replace(`${pathname}?${p.toString()}` as never);
          }}
          className={`px-3 py-1.5 rounded-full font-mono text-[11px] uppercase tracking-widest ${
            active === b.key ? "bg-mint text-bg" : "text-ink hover:text-mint"
          }`}
        >
          {b.label}
        </button>
      ))}
    </div>
  );
}
