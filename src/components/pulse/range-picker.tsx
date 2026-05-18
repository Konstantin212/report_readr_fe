"use client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

const RANGES = ["1M", "3M", "6M", "YTD", "1Y", "2Y", "ALL"] as const;
export type Range = typeof RANGES[number];

export function RangePicker({ active = "2Y" }: { active?: Range }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function pick(r: Range) {
    const params = new URLSearchParams(sp.toString());
    params.set("range", r);
    router.replace(`${pathname}?${params.toString()}` as never);
  }

  return (
    <div className="flex gap-1 p-[3px] rounded-full bg-panel border border-border">
      {RANGES.map((r) => (
        <button
          key={r}
          onClick={() => pick(r)}
          className={`px-3 py-1.5 rounded-full font-mono text-[11px] uppercase tracking-widest ${
            active === r ? "bg-mint text-bg" : "text-muted hover:text-ink"
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}
