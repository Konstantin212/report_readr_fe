import { DataTable, type Column } from "./data-table";
import { Pagination } from "./pagination";
import { fmtEur } from "@/lib/format";
import type { DividendRow } from "@/lib/data/dividends";

/**
 * Paginated table of dividend distributions. The previous implementation
 * was a 5-column grid with `gap-0` — adjacent cells merged on mobile so
 * the WHT column visually disappeared into the GROSS column. Now uses
 * DataTable with proper gutters + per-row stacked card on mobile.
 */
export function DividendsTable({
  rows,
  total,
  page,
  pageSize,
  year,
  exportHref,
  basePath,
  preservedQuery,
}: {
  rows: DividendRow[];
  total: number;
  page: number;
  pageSize: number;
  year: number;
  exportHref: string;
  basePath: string;
  preservedQuery?: Record<string, string>;
}) {
  const columns: Column<DividendRow>[] = [
    { key: "date",   label: "Date",   gridCol: "0.9fr",
      cell: (r) => <span className="text-muted whitespace-nowrap">{r.date}</span> },
    { key: "ticker", label: "Ticker", gridCol: "0.7fr",
      cell: (r) => <span className="font-semibold">{r.ticker}</span> },
    { key: "broker", label: "Broker", gridCol: "0.6fr",
      cell: (r) => <span className="text-muted">{r.broker}</span> },
    { key: "gross",  label: "Gross",  gridCol: "1fr", align: "right",
      cell: (r) => <span className="text-amber">{r.ccy} {r.amount.toFixed(2)}</span> },
    { key: "wht",    label: "WHT",    gridCol: "0.9fr", align: "right",
      cell: (r) => (
        <span className={r.whtEur > 0 ? "text-bad" : "text-dim"}>
          {r.whtEur > 0 ? `−${fmtEur(r.whtEur)}` : "—"}
        </span>
      ) },
  ];

  return (
    <div>
      <DataTable<DividendRow>
        title={`All distributions · ${year}`}
        trailingHeader={
          <a href={exportHref} className="font-mono text-[11px] text-muted hover:text-ink">
            export csv →
          </a>
        }
        columns={columns}
        rows={rows}
        rowKey={(r, i) => `${r.date}-${r.ticker}-${i}`}
        emptyMessage="No dividends recorded."
        renderMobileCard={(r) => (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[14px]">{r.ticker}</span>
                <span className="font-mono text-[10px] text-muted bg-panel2 px-1.5 py-0.5 rounded">{r.broker}</span>
              </div>
              <div className="font-mono text-[11px] text-muted mt-0.5">{r.date}</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-amber font-semibold text-[14px]">
                {r.ccy} {r.amount.toFixed(2)}
              </div>
              {r.whtEur > 0 && (
                <div className="font-mono text-[10px] text-bad mt-0.5">
                  −{fmtEur(r.whtEur)} WHT
                </div>
              )}
            </div>
          </div>
        )}
        afterRows={
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            basePath={basePath}
            preservedQuery={preservedQuery}
            itemLabel={{ singular: "distribution", plural: "distributions" }}
          />
        }
      />
    </div>
  );
}
