import { DataTable, type Column } from "./data-table";
import { fmtEur } from "@/lib/format";

export type RealizedLot = {
  ticker: string;
  broker: string;
  method: string;
  opened: string;
  closed: string;
  qty: number;
  costEur: number;
  proceedsEur: number;
  gainEur: number;
};

/**
 * Anlage KAP realized-lots table. Stocks-only (crypto §23 has its own
 * component because the columns differ — long-term flag, no broker).
 */
export function RealizedLotsTable({
  lots,
  year,
  totalCostEur,
  totalProceedsEur,
  netRealizedEur,
}: {
  lots: RealizedLot[];
  year: number;
  totalCostEur: number;
  totalProceedsEur: number;
  netRealizedEur: number;
}) {
  const columns: Column<RealizedLot>[] = [
    { key: "ticker",   label: "Ticker",   gridCol: "0.9fr", cell: (l) => <span className="font-semibold">{l.ticker}</span> },
    { key: "broker",   label: "Broker",   gridCol: "0.7fr", cell: (l) => <span className="text-muted">{l.broker}</span> },
    { key: "method",   label: "Method",   gridCol: "0.55fr", cell: (l) => <span className="text-muted text-[10px] tracking-wider">{l.method}</span> },
    { key: "opened",   label: "Opened",   gridCol: "1fr",   cell: (l) => <span className="text-muted whitespace-nowrap">{l.opened}</span> },
    { key: "closed",   label: "Closed",   gridCol: "1fr",   cell: (l) => <span className="whitespace-nowrap">{l.closed}</span> },
    { key: "qty",      label: "Qty",      gridCol: "0.7fr", align: "right",
      cell: (l) => <span className="text-muted">{l.qty.toFixed(l.qty % 1 === 0 ? 0 : 4)}</span> },
    { key: "cost",     label: "Cost €",   gridCol: "1fr",   align: "right",
      cell: (l) => <span>{fmtEur(l.costEur, { noSymbol: true })}</span> },
    { key: "proceeds", label: "Proceeds", gridCol: "1fr",   align: "right",
      cell: (l) => <span>{fmtEur(l.proceedsEur, { noSymbol: true })}</span> },
    { key: "gain",     label: "Gain/Loss", gridCol: "1fr",  align: "right",
      cell: (l) => (
        <span className={`font-semibold ${l.gainEur >= 0 ? "text-mint" : "text-bad"}`}>
          {fmtEur(l.gainEur, { sign: true, noSymbol: true })}
        </span>
      ) },
  ];

  return (
    <DataTable<RealizedLot>
      title="Realized lots · FIFO matched"
      meta={`${lots.length} lots · ECB FX on trade date`}
      columns={columns}
      rows={lots}
      rowKey={(_, i) => `${_.ticker}-${_.closed}-${i}`}
      emptyMessage={`No realized lots for ${year}.`}
      renderMobileCard={(l) => (
        <div className="flex flex-col gap-2">
          {/* Line 1: ticker + broker badge + dates */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-[14px]">{l.ticker}</span>
              <span className="font-mono text-[10px] text-muted bg-panel2 px-1.5 py-0.5 rounded">{l.broker}</span>
              <span className="font-mono text-[9px] text-dim tracking-wider">{l.method}</span>
            </div>
            <span className={`font-mono font-semibold text-[14px] ${l.gainEur >= 0 ? "text-mint" : "text-bad"}`}>
              {fmtEur(l.gainEur, { sign: true })}
            </span>
          </div>
          {/* Line 2: opened → closed · qty */}
          <div className="flex items-center justify-between font-mono text-[11px] text-muted">
            <span>{l.opened} → {l.closed}</span>
            <span>{l.qty.toFixed(l.qty % 1 === 0 ? 0 : 4)} sh</span>
          </div>
          {/* Line 3: cost · proceeds */}
          <div className="flex items-center justify-between font-mono text-[11px]">
            <span><span className="text-dim mr-1">cost</span>{fmtEur(l.costEur)}</span>
            <span><span className="text-dim mr-1">proceeds</span>{fmtEur(l.proceedsEur)}</span>
          </div>
        </div>
      )}
      summary={{
        desktopCells: [
          <span key="lbl" className="font-mono text-[10px] text-muted uppercase tracking-widest col-span-6">Σ Net realized</span>,
          null, null, null, null, null,
          <span key="cost" className="text-right">{fmtEur(totalCostEur, { noSymbol: true })}</span>,
          <span key="proc" className="text-right">{fmtEur(totalProceedsEur, { noSymbol: true })}</span>,
          <span key="gain" className={`text-right ${netRealizedEur >= 0 ? "text-mint" : "text-bad"}`}>
            {fmtEur(netRealizedEur, { sign: true, noSymbol: true })}
          </span>,
        ],
        mobileLabel: "Σ Net realized",
        mobileBody: (
          <div className="flex justify-between items-baseline">
            <span className="text-muted text-[11px]">
              cost {fmtEur(totalCostEur)} · proceeds {fmtEur(totalProceedsEur)}
            </span>
            <span className={`text-[15px] ${netRealizedEur >= 0 ? "text-mint" : "text-bad"}`}>
              {fmtEur(netRealizedEur, { sign: true })}
            </span>
          </div>
        ),
      }}
    />
  );
}
