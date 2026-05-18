import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/server";
import { getPositionsData } from "@/lib/data/positions";
import { Card } from "@/components/pulse/card";
import { BrokerFilter } from "@/components/pulse/broker-filter";
import { SectorFilter } from "@/components/pulse/sector-filter";
import { PositionDetailPanel } from "@/components/pulse/position-detail-panel";

type SP = Promise<{ broker?: string; sector?: string; symbol?: string }>;

export default async function PositionsPage({ searchParams }: { searchParams: SP }) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const broker = (params.broker === "ff" || params.broker === "ibkr" ? params.broker : "all") as "all" | "ff" | "ibkr";
  const sector = params.sector ?? null;
  const symbol = params.symbol ?? null;

  const d = await getPositionsData(user.id, { broker, sector, symbol });
  const qs = (next: Record<string, string | null>) => {
    const usp = new URLSearchParams();
    if (broker !== "all") usp.set("broker", broker);
    if (sector) usp.set("sector", sector);
    for (const [k, v] of Object.entries(next)) {
      if (v === null) usp.delete(k);
      else usp.set(k, v);
    }
    const s = usp.toString();
    return s ? `?${s}` : "";
  };

  const fmtEur = (v: number) => "€" + Math.abs(v).toLocaleString("de-DE", { maximumFractionDigits: 0 });
  const fmtPct = (v: number | null) => v === null ? "—" : (v >= 0 ? "+" : "") + v.toFixed(1) + "%";

  return (
    <main className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">
          Positions{" "}
          <span className="font-mono text-sm text-muted ml-1 tracking-wider">{d.rows.length} of {d.total}</span>
        </h1>
        <div className="flex-1" />
        <BrokerFilter active={broker} />
        <SectorFilter active={sector ?? "all"} sectors={d.sectors} />
      </div>

      <div className={`grid gap-4 ${d.selected ? "grid-cols-[1.6fr_1fr]" : "grid-cols-1"}`}>
        <Card className="p-0 overflow-hidden">
          <div className="grid grid-cols-[1.6fr_0.6fr_0.5fr_0.7fr_0.7fr_0.9fr_0.9fr_0.7fr] gap-0 px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-dim border-b border-border">
            <span>Holding</span>
            <span>Broker</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Avg €</span>
            <span className="text-right">Price €</span>
            <span className="text-right">Value €</span>
            <span className="text-right">P/L</span>
            <span className="text-right">%</span>
          </div>
          {d.rows.length === 0 && <div className="p-6 text-muted text-sm">No positions match the current filter.</div>}
          {d.rows.map(r => {
            const isSelected = r.symbol === symbol;
            return (
              <Link
                key={r.symbol}
                href={`/positions${qs({ symbol: r.symbol })}` as never}
                className={`grid grid-cols-[1.6fr_0.6fr_0.5fr_0.7fr_0.7fr_0.9fr_0.9fr_0.7fr] gap-0 px-5 py-3 items-center cursor-pointer hover:bg-panel2/50 ${
                  isSelected ? "bg-panel2 border-l-2 border-l-mint" : "border-l-2 border-transparent"
                } border-b border-border`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono text-[11px] font-bold ${
                    isSelected ? "bg-mint/20 text-mint" : "bg-panel2 text-muted"
                  }`}>{r.symbol.slice(0,2)}</div>
                  <div>
                    <div className="font-semibold text-[13px]">
                      {r.symbol}{" "}
                      <span className="font-mono text-[10px] text-dim ml-1">{r.sector} · {r.currency}</span>
                    </div>
                    {r.name && <div className="text-[11px] text-muted">{r.name}</div>}
                  </div>
                </div>
                <span className="font-mono text-xs text-muted">{r.broker}</span>
                <span className="text-right font-mono text-xs text-muted">{r.qty}</span>
                <span className="text-right font-mono text-xs text-muted">{r.avgCostEur.toFixed(2)}</span>
                <span className="text-right font-mono text-xs">{r.pricePerUnitEur === null ? "—" : r.pricePerUnitEur.toFixed(2)}</span>
                <span className="text-right font-mono font-semibold text-xs">
                  {r.marketEur === null ? "—" : fmtEur(r.marketEur)}
                </span>
                <span className={`text-right font-mono font-semibold text-xs ${r.plEur === null ? "text-muted" : r.plEur >= 0 ? "text-mint" : "text-bad"}`}>
                  {r.plEur === null ? "—" : (r.plEur >= 0 ? "+" : "−") + fmtEur(r.plEur)}
                </span>
                <span className={`text-right font-mono font-semibold text-xs ${r.plPct === null ? "text-muted" : r.plPct >= 0 ? "text-mint" : "text-bad"}`}>
                  {fmtPct(r.plPct)}
                </span>
              </Link>
            );
          })}
          {d.rows.length > 0 && (
            <div className="grid grid-cols-[1.6fr_0.6fr_0.5fr_0.7fr_0.7fr_0.9fr_0.9fr_0.7fr] gap-0 px-5 py-3 bg-panel2 font-mono text-xs font-semibold">
              <span className="col-span-5 font-mono text-[10px] text-muted uppercase tracking-widest">Σ Total</span>
              <span className="text-right">{fmtEur(d.totalMarketEur)}</span>
              <span className={`text-right ${d.totalPlEur >= 0 ? "text-mint" : "text-bad"}`}>
                {(d.totalPlEur >= 0 ? "+" : "−") + fmtEur(d.totalPlEur)}
              </span>
              <span />
            </div>
          )}
        </Card>

        {d.selected && <PositionDetailPanel d={{
          symbol: d.selected.symbol,
          name: d.selected.name,
          broker: d.selected.broker,
          sector: d.selected.sector,
          currency: d.selected.currency,
          marketEur: d.selected.marketEur ?? 0,
          qty: d.selected.qty,
          pricePerUnitEur: d.selected.pricePerUnitEur ?? 0,
          unrealizedEur: d.selected.plEur ?? 0,
          unrealizedPct: d.selected.plPct,
          avgCostEur: d.selected.avgCostEur,
          sparkline: d.selected.sparkline,
          sparkPctChange: d.selected.sparkPctChange,
          lots: d.selected.lots,
          dividendsYtdEur: d.selected.dividendsYtdEur,
          yieldOnCostPct: d.selected.yieldOnCostPct,
          daysHeld: d.selected.daysHeld,
        }} />}
      </div>
    </main>
  );
}
