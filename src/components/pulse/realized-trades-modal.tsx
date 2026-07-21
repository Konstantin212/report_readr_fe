"use client";
import { useEffect } from "react";
import { X } from "lucide-react";
import { fmtEur } from "@/lib/format";
import type { RealizedLot } from "./realized-lots-table";

const GRID_COLS = "1.2fr .7fr .8fr 1fr 1fr 1fr";

/**
 * Full-lot drill-down for the realized-trades summary card. Presentational
 * only — opened/closed state is owned by the caller (Task 10 wires it up
 * from `tax-client.tsx`). Mirrors the ESC + backdrop-click close pattern
 * from `PositionDetailPanel`.
 */
export function RealizedTradesModal({
  lots,
  totals,
  open,
  onClose,
}: {
  lots: RealizedLot[];
  totals: { proceedsEur: number; netRealizedEur: number };
  open: boolean;
  onClose: () => void;
}) {
  // ESC closes. Listening at the document level so the modal doesn't
  // need focus to react.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-[rgba(6,7,9,.72)] backdrop-blur flex items-start justify-center overflow-auto p-0 sm:p-14"
      onClick={onClose}
      aria-hidden="false"
    >
      <div
        className="w-full max-w-[860px] h-[100dvh] sm:h-auto bg-panel border border-borderHard sm:rounded-[22px] overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="realized-trades-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header. */}
        <div className="flex justify-between items-center px-6 py-5 border-b border-border shrink-0">
          <div>
            <div id="realized-trades-title" className="font-bold text-[19px]">
              Realized trades
            </div>
            <div className="font-mono text-[12px] text-muted mt-1">
              {lots.length} lot{lots.length === 1 ? "" : "s"} · FIFO matched · ECB FX on trade date
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-[34px] h-[34px] rounded-md border border-border flex items-center justify-center text-muted hover:text-ink hover:bg-panel2 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable lot list with sticky column header. */}
        <div className="overflow-auto max-h-[64vh] flex-1">
          <div
            className="grid gap-0 px-6 py-3.5 font-mono text-[10px] uppercase tracking-widest text-dim sticky top-0 bg-panel border-b border-border"
            style={{ gridTemplateColumns: GRID_COLS }}
          >
            <span>Ticker</span>
            <span>Broker</span>
            <span className="text-right">Closed</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Proceeds</span>
            <span className="text-right">Gain / Loss</span>
          </div>

          {lots.length === 0 && (
            <div className="px-6 py-8 text-muted text-sm text-center">No realized lots.</div>
          )}

          {lots.map((l, i) => (
            <div
              key={`${l.ticker}-${l.closed}-${i}`}
              className="grid gap-0 px-6 py-3 items-center border-b border-border"
              style={{ gridTemplateColumns: GRID_COLS }}
            >
              <span className="font-mono text-[14px] font-semibold">{l.ticker}</span>
              <span className="font-mono text-[12px] text-muted">{l.broker}</span>
              <span className="font-mono text-[12px] text-right text-muted">{l.closed}</span>
              <span className="font-mono text-[13px] text-right text-ink/70">
                {l.qty.toFixed(l.qty % 1 === 0 ? 0 : 4)}
              </span>
              <span className="font-mono text-[13px] text-right text-ink/70">
                {fmtEur(l.proceedsEur)}
              </span>
              <span className={`font-mono text-[14px] font-semibold text-right ${l.gainEur >= 0 ? "text-mint" : "text-bad"}`}>
                {fmtEur(l.gainEur, { sign: true })}
              </span>
            </div>
          ))}
        </div>

        {/* Σ footer. */}
        <div
          className="grid gap-0 px-6 py-4 bg-panel2 border-t border-borderHard items-center shrink-0"
          style={{ gridTemplateColumns: GRID_COLS }}
        >
          <span className="font-mono text-[11px] uppercase tracking-widest text-muted col-span-4">
            Σ Net realized
          </span>
          <span className="font-mono text-[14px] text-right text-muted">
            {fmtEur(totals.proceedsEur)}
          </span>
          <span className={`font-mono text-[15px] font-bold text-right ${totals.netRealizedEur >= 0 ? "text-mint" : "text-bad"}`}>
            {fmtEur(totals.netRealizedEur, { sign: true })}
          </span>
        </div>
      </div>
    </div>
  );
}
