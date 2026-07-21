"use client";
import { Card } from "./card";
import { AllocationDonut } from "./allocation-donut";
import { heroSummary, sectorAllocation } from "@/lib/analytics/positions-view";
import type { PositionsData } from "@/lib/data/positions";

const eur = (v: number) => "€" + Math.abs(v).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function PositionsHero({ d }: { d: PositionsData }) {
  const s = heroSummary(d);
  const alloc = sectorAllocation(d);
  const up = s.plEur >= 0;
  return (
    <Card className="relative overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-6 lg:gap-8 items-center">
      <div className="absolute right-[-60px] top-[-70px] w-[320px] h-[320px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(124,255,178,.12) 0%, transparent 68%)" }} />
      <div className="relative">
        <div className="font-mono text-[11px] uppercase tracking-widest text-dim">Portfolio value</div>
        <div className="text-[44px] lg:text-[52px] font-bold tracking-tight leading-none num mt-2">{eur(s.marketEur)}</div>
        <div className={`mt-3 font-mono text-sm ${up ? "text-mint" : "text-bad"}`}>
          {up ? "+" : "−"}{eur(s.plEur)} {s.plPct === null ? "" : `· ${up ? "+" : ""}${s.plPct.toFixed(1)}%`} all-time
        </div>
        <div className="mt-1 font-mono text-[11px] text-dim">Cash held separately · see the Cash section below.</div>
      </div>
      <div className="relative">
        <AllocationDonut
          data={alloc.map(a => ({ name: a.name, pct: a.pct, value: a.value }))}
          centerSublabel="Sectors" centerLabel={`${alloc.length}`}
        />
      </div>
    </Card>
  );
}
