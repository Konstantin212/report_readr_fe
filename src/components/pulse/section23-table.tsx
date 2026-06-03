import { DataTable, type Column } from "./data-table";
import { fmtEur, fmtQty } from "@/lib/format";
import type { Section23Match } from "@/lib/tax/anlage-so";

/**
 * Anlage SO §23 private-sale matches table. Crypto-specific FIFO closes
 * with the long-term (>365d) tax-free flag.
 */
export function Section23Table({ matches }: { matches: Section23Match[] }) {
  if (matches.length === 0) return null;

  const columns: Column<Section23Match>[] = [
    { key: "opened",   label: "Opened",   gridCol: "1fr",
      cell: (m) => <span className="text-muted whitespace-nowrap">{m.openedAt}</span> },
    { key: "closed",   label: "Closed",   gridCol: "1fr",
      cell: (m) => <span className="whitespace-nowrap">{m.closedAt}</span> },
    { key: "coin",     label: "Coin",     gridCol: "0.6fr",
      cell: (m) => <span className="font-semibold">{m.symbol}</span> },
    { key: "qty",      label: "Qty",      gridCol: "0.9fr", align: "right",
      cell: (m) => <span className="text-muted">{fmtQty(m.qty, 6)}</span> },
    { key: "days",     label: "Days",     gridCol: "0.5fr", align: "right",
      cell: (m) => <span className="text-muted">{m.holdingDays}</span> },
    { key: "cost",     label: "Cost €",   gridCol: "0.95fr", align: "right",
      cell: (m) => <span>{fmtEur(m.costEur, { noSymbol: true })}</span> },
    { key: "proceeds", label: "Proceeds", gridCol: "0.95fr", align: "right",
      cell: (m) => <span>{fmtEur(m.proceedsEur, { noSymbol: true })}</span> },
    { key: "gain",     label: "Gain",     gridCol: "0.95fr", align: "right",
      cell: (m) => (
        <span className={`font-semibold ${m.gainEur >= 0 ? "text-mint" : "text-bad"}`}>
          {fmtEur(m.gainEur, { sign: true, noSymbol: true })}
        </span>
      ) },
    { key: "lt",       label: "LT?",      gridCol: "0.5fr", align: "right",
      cell: (m) => m.isLongTerm
        ? <span className="text-mint" title="held > 365 days, tax-free under §23 EStG">✓</span>
        : <span className="text-dim">—</span> },
  ];

  return (
    <DataTable<Section23Match>
      title="§23 Private sale matches"
      meta="Long-term (>365d) are tax-free; short-term contribute to taxable §23 income"
      trailingHeader={<span className="font-mono text-[11px] text-muted">{matches.length} match{matches.length === 1 ? "" : "es"}</span>}
      columns={columns}
      rows={matches}
      rowKey={(m, i) => `${m.openedAt}-${m.closedAt}-${m.symbol}-${i}`}
      renderMobileCard={(m) => (
        <div className="flex flex-col gap-2">
          {/* Line 1: coin + LT pill + gain */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[14px]">{m.symbol}</span>
              {m.isLongTerm ? (
                <span className="font-mono text-[9px] text-mint bg-mint/15 px-1.5 py-0.5 rounded tracking-wider">
                  LONG-TERM · TAX-FREE
                </span>
              ) : (
                <span className="font-mono text-[9px] text-amber bg-amber/15 px-1.5 py-0.5 rounded tracking-wider">
                  SHORT-TERM
                </span>
              )}
            </div>
            <span className={`font-mono font-semibold text-[14px] ${m.gainEur >= 0 ? "text-mint" : "text-bad"}`}>
              {fmtEur(m.gainEur, { sign: true })}
            </span>
          </div>
          {/* Line 2: opened → closed (days) · qty */}
          <div className="flex items-center justify-between font-mono text-[11px] text-muted">
            <span>{m.openedAt} → {m.closedAt} · {m.holdingDays}d</span>
            <span>{fmtQty(m.qty, 6)}</span>
          </div>
          {/* Line 3: cost · proceeds */}
          <div className="flex items-center justify-between font-mono text-[11px]">
            <span><span className="text-dim mr-1">cost</span>{fmtEur(m.costEur)}</span>
            <span><span className="text-dim mr-1">proceeds</span>{fmtEur(m.proceedsEur)}</span>
          </div>
        </div>
      )}
    />
  );
}
