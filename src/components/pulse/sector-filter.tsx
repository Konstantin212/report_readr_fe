"use client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

export function SectorFilter({ active = "all", sectors }: { active?: string; sectors: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const options = ["all", ...sectors];
  return (
    // Scroll the pills inside their own track on narrow screens instead of
    // widening the page (which caused horizontal page scroll on mobile).
    <div className="max-w-full overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex gap-0.5 p-[3px] rounded-full bg-panel border border-border w-max">
        {options.map((s) => (
          <button
            key={s}
            onClick={() => {
              const p = new URLSearchParams(sp.toString());
              if (s === "all") p.delete("sector");
              else p.set("sector", s);
              router.replace(`${pathname}?${p.toString()}` as never);
            }}
            className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full font-mono text-[11px] uppercase tracking-widest ${
              active === s ? "bg-mint text-bg" : "text-muted hover:text-ink"
            }`}
          >
            {s === "all" ? "All sectors" : s}
          </button>
        ))}
      </div>
    </div>
  );
}
