import { DataTable, type Column } from "./data-table";
import { fmtEur, fmtQty } from "@/lib/format";

export type StakingCoinRow = {
  symbol: string;
  eventCount: number;
  quantity: number;
  totalEur: number;
};

/**
 * Anlage SO per-coin staking summary. Sum row at the bottom so the
 * total matches the hero number visually.
 */
export function StakingPerCoinTable({
  rows,
  year,
  totalEur,
}: {
  rows: StakingCoinRow[];
  year: number;
  totalEur: number;
}) {
  const columns: Column<StakingCoinRow>[] = [
    { key: "coin",    label: "Coin",         gridCol: "1fr",
      cell: (c) => <span className="font-semibold">{c.symbol}</span> },
    { key: "qty",     label: "Quantity",     gridCol: "1.2fr", align: "right",
      cell: (c) => <span className="text-muted">{fmtQty(c.quantity, 6)}</span> },
    { key: "count",   label: "Payouts",      gridCol: "0.7fr", align: "right",
      cell: (c) => <span className="text-muted">{c.eventCount}</span> },
    { key: "avg",     label: "Avg €/event",  gridCol: "1fr",   align: "right",
      cell: (c) => <span className="text-muted">{fmtEur(c.eventCount > 0 ? c.totalEur / c.eventCount : 0, { dec: 4, noSymbol: true })}</span> },
    { key: "total",   label: "Total €",      gridCol: "1fr",   align: "right",
      cell: (c) => <span className="font-semibold text-mint">{fmtEur(c.totalEur, { noSymbol: true })}</span> },
  ];

  return (
    <DataTable<StakingCoinRow>
      title="Staking by coin"
      meta={`${rows.length} coin${rows.length === 1 ? "" : "s"} · ${rows.reduce((s, r) => s + r.eventCount, 0)} payouts`}
      columns={columns}
      rows={rows}
      rowKey={(c) => c.symbol}
      emptyMessage={`No staking events for ${year}.`}
      renderMobileCard={(c) => (
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="font-semibold text-[14px]">{c.symbol}</div>
            <div className="font-mono text-[11px] text-muted mt-0.5">
              {fmtQty(c.quantity, 6)} · {c.eventCount} payouts
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono font-semibold text-mint text-[14px]">{fmtEur(c.totalEur)}</div>
            <div className="font-mono text-[10px] text-dim mt-0.5">
              avg {fmtEur(c.eventCount > 0 ? c.totalEur / c.eventCount : 0, { dec: 4 })}
            </div>
          </div>
        </div>
      )}
      summary={{
        desktopCells: [
          <span key="lbl" className="font-mono text-[10px] text-muted uppercase tracking-widest col-span-4">Σ Total</span>,
          null, null, null,
          <span key="total" className="text-right text-mint">{fmtEur(totalEur, { noSymbol: true })}</span>,
        ],
        mobileLabel: "Σ Total",
        mobileBody: (
          <div className="text-right">
            <span className="text-mint text-[15px]">{fmtEur(totalEur)}</span>
          </div>
        ),
      }}
    />
  );
}
