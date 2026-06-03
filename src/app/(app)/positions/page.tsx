import { requireCurrentUser } from "@/lib/auth/server";
import { getPositionsData } from "@/lib/data/positions";
import { getCryptoPositions, rollUpCryptoPositions } from "@/lib/data/crypto-positions";
import { Card } from "@/components/pulse/card";
import { SectorFilter } from "@/components/pulse/sector-filter";
import { PositionDetailPanel } from "@/components/pulse/position-detail-panel";
import { PositionsSection } from "@/components/pulse/positions-section";
import { CashCard } from "@/components/pulse/cash-card";
import { CryptoPositionsSection } from "@/components/pulse/crypto-positions-section";

type SP = Promise<{ broker?: string; sector?: string; symbol?: string }>;

export default async function PositionsPage({ searchParams }: { searchParams: SP }) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const broker = (params.broker === "ff" || params.broker === "ibkr" ? params.broker : "all") as "all" | "ff" | "ibkr";
  const sector = params.sector ?? null;
  const symbol = params.symbol ?? null;

  const [d, cryptoPositions] = await Promise.all([
    getPositionsData(user.id, { broker, sector, symbol }),
    broker === "all" ? getCryptoPositions(user.id) : Promise.resolve([]),
  ]);
  const cryptoRollup = rollUpCryptoPositions(cryptoPositions);
  // Plain serialisable shape for the client-side PositionsSection — broker
  // and sector filters carry across when the user clicks a row, the
  // component appends `symbol` on its own.
  const preservedQuery: Record<string, string> = {};
  if (broker !== "all") preservedQuery.broker = broker;
  if (sector) preservedQuery.sector = sector;

  const hasNoPositions =
    d.rowsByKind.stock.length === 0 &&
    d.rowsByKind.etf.length === 0 &&
    d.rowsByKind.bond.length === 0 &&
    d.rowsByKind.other.length === 0 &&
    d.cash.length === 0;

  return (
    <main className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">
          Positions{" "}
          <span className="font-mono text-sm text-muted ml-1 tracking-wider">{d.rows.length} of {d.total}</span>
        </h1>
        <div className="flex-1" />
        {/* Broker filter lives in the global topbar — duplicating it here
            confused users (two identical chip groups visible). Sector
            filter stays page-local because it's positions-specific. */}
        <SectorFilter active={sector ?? "all"} sectors={d.sectors} />
      </div>

      <div className={`grid gap-4 ${d.selected ? "grid-cols-1 lg:grid-cols-[1.6fr_1fr]" : "grid-cols-1"}`}>
        <div className="space-y-4">
          <PositionsSection
            title="Stocks"
            count={d.rowsByKind.stock.length}
            rows={d.rowsByKind.stock}
            basePath="/positions"
            preservedQuery={preservedQuery}
            selectedSymbol={symbol}
            showToggle
          />
          <PositionsSection
            title="ETFs"
            count={d.rowsByKind.etf.length}
            rows={d.rowsByKind.etf}
            basePath="/positions"
            preservedQuery={preservedQuery}
            selectedSymbol={symbol}
          />
          <PositionsSection
            title="Bonds"
            count={d.rowsByKind.bond.length}
            rows={d.rowsByKind.bond}
            basePath="/positions"
            preservedQuery={preservedQuery}
            selectedSymbol={symbol}
          />
          <PositionsSection
            title="Other"
            count={d.rowsByKind.other.length}
            rows={d.rowsByKind.other}
            basePath="/positions"
            preservedQuery={preservedQuery}
            selectedSymbol={symbol}
          />
          <CashCard balances={d.cash} />
          <CryptoPositionsSection positions={cryptoPositions} rollup={cryptoRollup} />
          {hasNoPositions && (
            <Card>
              <div className="text-muted text-sm">No positions match the current filter.</div>
            </Card>
          )}
        </div>

        {d.selected && <PositionDetailPanel d={{
          symbol: d.selected.symbol,
          name: d.selected.name,
          broker: d.selected.broker,
          sector: d.selected.sector,
          currency: d.selected.currency,
          marketEur: d.selected.marketEur ?? 0,
          qty: d.selected.qty,
          pricePerUnitEur: d.selected.pricePerUnitEur ?? 0,
          views: {
            broker: {
              unrealizedEur: d.selected.views.broker.plEur ?? 0,
              unrealizedPct: d.selected.views.broker.plPct,
              avgCostEur: d.selected.views.broker.avgCostEur,
            },
            net: {
              unrealizedEur: d.selected.views.net.plEur ?? 0,
              unrealizedPct: d.selected.views.net.plPct,
              avgCostEur: d.selected.views.net.avgCostEur,
            },
          },
          sparkline: d.selected.sparkline,
          sparkPctChange: d.selected.sparkPctChange,
          lots: d.selected.lots,
          dividendsYtdEur: d.selected.dividendsYtdEur,
          dividendsTotalEur: d.selected.dividendsEur,
          feesEur: d.selected.feesEur,
          yieldOnCostPct: d.selected.yieldOnCostPct,
          daysHeld: d.selected.daysHeld,
        }} />}
      </div>
    </main>
  );
}
