"use client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { PositionSort } from "@/lib/analytics/positions-view";

const OPTS: { key: PositionSort; label: string }[] = [
  { key: "value", label: "Value" },
  { key: "gain", label: "Gain" },
  { key: "az", label: "A–Z" },
];

export function PositionsSort({ active }: { active: PositionSort }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (
    <div className="flex gap-0.5 p-[3px] rounded-full bg-panel border border-border">
      {OPTS.map((o) => (
        <button
          key={o.key}
          onClick={() => {
            const p = new URLSearchParams(sp.toString());
            if (o.key === "value") p.delete("sort");
            else p.set("sort", o.key);
            router.replace(`${pathname}?${p.toString()}` as never);
          }}
          className={`px-3 py-1.5 rounded-full font-mono text-[11px] uppercase tracking-widest ${
            active === o.key ? "bg-mint text-bg" : "text-ink hover:text-mint"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
