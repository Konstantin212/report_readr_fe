import React from "react";

import { cn } from "@/lib/utils";
import { Card } from "./card";

/**
 * Mobile-first data table primitive. One source of truth for the
 * "stacked card on mobile, dense grid on desktop" pattern that
 * previously had to be re-applied to each table — and was the root
 * cause of every "numbers run together" bug on /tax, /tax/anlage-so,
 * /positions (crypto), and /dividends.
 *
 * Each column gets:
 *  - a desktop layout (`gridCol` defines its `grid-template-columns`
 *    weight; `headerLabel` + `cell()` define what renders at lg:)
 *  - the mobile rendering is fully owned by the caller via
 *    `renderMobileCard`, so each surface can pick the most legible
 *    stacked layout for its data (some want 2 lines, some want 3).
 *
 * A column with `mobileOnly: true` is rendered only inside the mobile
 * card builder (caller may ignore it). A column with `desktopOnly:
 * true` is included in the grid template but skipped on mobile.
 */

export type Column<R> = {
  key: string;
  label: string;
  /** Grid column weight, e.g. "0.9fr", "1fr", "60px". */
  gridCol: string;
  align?: "left" | "right";
  /** Renderer for the desktop grid cell. */
  cell: (row: R, index: number) => React.ReactNode;
};

export type DataTableProps<R> = {
  title?: string;
  meta?: string | React.ReactNode;
  trailingHeader?: React.ReactNode;
  columns: Column<R>[];
  rows: R[];
  rowKey: (row: R, index: number) => string;
  /** Mobile-only stacked-card body. Renders inside a `lg:hidden` block. */
  renderMobileCard: (row: R, index: number) => React.ReactNode;
  /** Optional summary footer — rendered both desktop (as grid) and mobile (as stacked card). */
  summary?: {
    desktopCells: React.ReactNode[];  // already in column order; nulls collapse
    mobileLabel: string;
    mobileBody: React.ReactNode;
  };
  emptyMessage?: string;
  /** Optional secondary footer (e.g. caveats text), rendered inside a
   *  muted compact bar below `afterRows`. */
  footer?: React.ReactNode;
  /** Optional block rendered between the rows and `footer`. Use for
   *  full-width controls like Pagination that need their own padding. */
  afterRows?: React.ReactNode;
  className?: string;
};

export function DataTable<R>({
  title,
  meta,
  trailingHeader,
  columns,
  rows,
  rowKey,
  renderMobileCard,
  summary,
  emptyMessage = "No data.",
  footer,
  afterRows,
  className,
}: DataTableProps<R>) {
  return (
    <Card className={cn("p-0 overflow-hidden", className)}>
      {(title || meta || trailingHeader) && (
        <div className="px-5 py-4 border-b border-border flex flex-wrap gap-2 justify-between items-center">
          <div className="min-w-0">
            {title && <div className="font-semibold text-sm">{title}</div>}
            {meta && <div className="font-mono text-[11px] text-muted mt-0.5">{meta}</div>}
          </div>
          {trailingHeader && <div className="shrink-0">{trailingHeader}</div>}
        </div>
      )}

      {/* Desktop column headers — hidden on mobile because mobile cards
          carry their own labels inline. Inline style on grid-template
          avoids the Tailwind JIT-purge problem with dynamic class names. */}
      <div
        className="hidden lg:grid gap-3 px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-dim border-b border-border"
        style={{ gridTemplateColumns: columns.map((c) => c.gridCol).join(" ") }}
      >
        {columns.map((c) => (
          <span key={c.key} className={c.align === "right" ? "text-right" : ""}>{c.label}</span>
        ))}
      </div>

      {rows.length === 0 && (
        <div className="p-6 text-muted text-sm text-center">{emptyMessage}</div>
      )}

      {rows.map((row, i) => (
        <div
          key={rowKey(row, i)}
          className="border-b border-border last:border-b-0"
        >
          {/* Mobile: stacked card */}
          <div className="lg:hidden px-4 py-3">{renderMobileCard(row, i)}</div>

          {/* Desktop: grid row.
              `gap-3` (12px) gives real breathing room between columns —
              previously `gap-0` is what made adjacent values smash. */}
          <div
            className="hidden lg:grid gap-3 px-5 py-3 font-mono text-[13px] items-center"
            style={{ gridTemplateColumns: columns.map((c) => c.gridCol).join(" ") }}
          >
            {columns.map((c) => (
              <span key={c.key} className={c.align === "right" ? "text-right" : ""}>
                {c.cell(row, i)}
              </span>
            ))}
          </div>
        </div>
      ))}

      {summary && rows.length > 0 && (
        <>
          {/* Mobile summary card */}
          <div className="lg:hidden px-4 py-3 bg-panel2 border-t border-borderHard">
            <div className="font-mono text-[10px] text-muted uppercase tracking-widest mb-1">
              {summary.mobileLabel}
            </div>
            <div className="font-mono text-[13px] font-semibold">{summary.mobileBody}</div>
          </div>
          {/* Desktop summary row */}
          <div
            className="hidden lg:grid gap-3 px-5 py-3 bg-panel2 font-mono text-[13px] font-semibold border-t border-borderHard"
            style={{ gridTemplateColumns: columns.map((c) => c.gridCol).join(" ") }}
          >
            {summary.desktopCells.map((cell, i) => (
              <span key={i} className={columns[i]?.align === "right" ? "text-right" : ""}>
                {cell ?? ""}
              </span>
            ))}
          </div>
        </>
      )}

      {afterRows && <div className="border-t border-border">{afterRows}</div>}

      {footer && (
        <div className="px-5 py-2.5 font-mono text-[10px] text-dim border-t border-border">
          {footer}
        </div>
      )}
    </Card>
  );
}
