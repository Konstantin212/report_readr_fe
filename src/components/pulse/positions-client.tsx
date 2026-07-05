"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Card } from "@/components/pulse/card";
import { SectorFilter } from "@/components/pulse/sector-filter";
import { PositionsSection } from "@/components/pulse/positions-section";
import { CashCard } from "@/components/pulse/cash-card";
import { PositionDetailPanel, type DetailData } from "@/components/pulse/position-detail-panel";
import type { SelectedPosition } from "@/lib/data/positions";
import { positionsDataSchema, selectedPositionSchema } from "@/lib/api/contracts";
import { fetchApi } from "@/lib/api/client";

/** Map the loader's SelectedPosition onto the panel's DetailData shape
 *  (the panel renames plEur→unrealizedEur, asOf→priceAsOf, etc.). */
function toDetailData(sel: SelectedPosition): DetailData {
  return {
    symbol: sel.symbol,
    name: sel.name,
    broker: sel.broker,
    sector: sel.sector,
    currency: sel.currency,
    marketEur: sel.marketEur ?? 0,
    qty: sel.qty,
    pricePerUnitEur: sel.pricePerUnitEur ?? 0,
    views: {
      broker: {
        unrealizedEur: sel.views.broker.plEur ?? 0,
        unrealizedPct: sel.views.broker.plPct,
        avgCostEur: sel.views.broker.avgCostEur,
      },
      net: {
        unrealizedEur: sel.views.net.plEur ?? 0,
        unrealizedPct: sel.views.net.plPct,
        avgCostEur: sel.views.net.avgCostEur,
      },
    },
    sparkline: sel.sparkline,
    sparkPctChange: sel.sparkPctChange,
    lots: sel.lots,
    dividendsYtdEur: sel.dividendsYtdEur,
    dividendsTotalEur: sel.dividendsTotalEur,
    dividendsTotalCount: sel.dividendsTotalCount,
    feesEur: sel.feesEur,
    yieldOnCostPct: sel.yieldOnCostPct,
    daysHeld: sel.daysHeld,
    priceAsOf: sel.asOf,
    transactions: sel.transactions,
    isin: sel.isin ?? null,
    meta: sel.meta,
  };
}

export function PositionsClient({ broker, sector }: { broker: "all" | "ff" | "ibkr"; sector: string | null }) {
  const [selected, setSelected] = useState<string | null>(null);

  const qs = new URLSearchParams();
  if (broker !== "all") qs.set("broker", broker);
  if (sector) qs.set("sector", sector);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";

  const listQ = useQuery({
    queryKey: ["positions", broker, sector],
    queryFn: () => fetchApi(`/api/positions${suffix}`, positionsDataSchema),
  });

  const detailQ = useQuery({
    queryKey: ["position", broker, sector, selected],
    queryFn: () => fetchApi(`/api/positions/${encodeURIComponent(selected!)}${suffix}`, selectedPositionSchema),
    enabled: selected !== null,
  });

  const d = listQ.data;

  return (
    <main className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">
          Positions{" "}
          <span className="font-mono text-sm text-muted ml-1 tracking-wider">
            {d ? `${d.rows.length} of ${d.total}` : "…"}
          </span>
        </h1>
        <div className="flex-1" />
        {d && <SectorFilter active={sector ?? "all"} sectors={d.sectors} />}
      </div>

      {listQ.isPending && (
        <Card>
          <div className="flex items-center gap-3 text-muted text-sm">
            <span className="inline-block w-4 h-4 rounded-full border-2 border-mint/40 border-t-mint animate-spin" />
            Loading positions…
          </div>
        </Card>
      )}

      {listQ.isError && (
        <Card>
          <div className="text-bad text-sm flex items-center justify-between gap-3">
            <span>Couldn’t load positions.</span>
            <button
              type="button"
              onClick={() => listQ.refetch()}
              className="font-mono text-[11px] uppercase tracking-widest border border-borderHard px-3 py-1.5 rounded-md"
            >
              Retry
            </button>
          </div>
        </Card>
      )}

      {d && (
        <div className="space-y-4">
          <PositionsSection title="Stocks" count={d.rowsByKind.stock.length} rows={d.rowsByKind.stock} onSelect={setSelected} selectedSymbol={selected} showToggle />
          <PositionsSection title="ETFs" count={d.rowsByKind.etf.length} rows={d.rowsByKind.etf} onSelect={setSelected} selectedSymbol={selected} />
          <PositionsSection title="Bonds" count={d.rowsByKind.bond.length} rows={d.rowsByKind.bond} onSelect={setSelected} selectedSymbol={selected} />
          <PositionsSection title="Other" count={d.rowsByKind.other.length} rows={d.rowsByKind.other} onSelect={setSelected} selectedSymbol={selected} />
          <CashCard balances={d.cash} />
          {d.rowsByKind.stock.length === 0 &&
            d.rowsByKind.etf.length === 0 &&
            d.rowsByKind.bond.length === 0 &&
            d.rowsByKind.other.length === 0 &&
            d.cash.length === 0 && (
              <Card>
                <div className="text-muted text-sm">No positions match the current filter.</div>
              </Card>
            )}
        </div>
      )}

      {selected !== null && (
        detailQ.data ? (
          <PositionDetailPanel d={toDetailData(detailQ.data)} onClose={() => setSelected(null)} />
        ) : (
          <PositionDetailLoading onClose={() => setSelected(null)} error={detailQ.isError} onRetry={() => detailQ.refetch()} />
        )
      )}
    </main>
  );
}

/** Overlay shown while the on-demand detail query is in flight (or errored).
 *  Mirrors the panel's fixed-position layout so open feels instant even
 *  before the data lands. */
function PositionDetailLoading({ onClose, error, onRetry }: { onClose: () => void; error: boolean; onRetry: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-bg/60 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <aside className="fixed z-50 right-0 top-0 h-screen w-full lg:w-[440px] bg-panel border-l border-border shadow-2xl">
        <div className="p-[22px] flex items-center gap-3 text-muted text-sm">
          {error ? (
            <>
              <span className="text-bad">Couldn’t load this position.</span>
              <button type="button" onClick={onRetry} className="font-mono text-[11px] uppercase tracking-widest border border-borderHard px-3 py-1.5 rounded-md">Retry</button>
              <button type="button" onClick={onClose} className="ml-auto font-mono text-[11px] uppercase tracking-widest">Close</button>
            </>
          ) : (
            <>
              <span className="inline-block w-4 h-4 rounded-full border-2 border-mint/40 border-t-mint animate-spin" />
              Loading position…
            </>
          )}
        </div>
      </aside>
    </>
  );
}
