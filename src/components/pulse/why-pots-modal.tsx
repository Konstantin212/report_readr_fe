"use client";

/**
 * Static "Why two pots?" explainer opened from `TaxBucketsCard`.
 *
 * Tax copy here is legal-sensitive (§20 Abs. 6 EStG / §20 Abs. 6 S. 4) and is
 * reused byte-identical from `tax-buckets-card.tsx` — do not reword,
 * paraphrase, or invent new tax statements in this file. Mirrors the
 * ESC + backdrop-click close pattern used by `RealizedTradesModal`.
 */
import { useEffect } from "react";
import { X } from "lucide-react";

export function WhyPotsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  // ESC closes. Listening at the document level so the modal doesn't need
  // focus to react.
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
      className="fixed inset-0 z-50 bg-[rgba(6,7,9,.72)] backdrop-blur flex items-center justify-center p-6"
      onClick={onClose}
      aria-hidden="false"
    >
      <div
        className="w-full max-w-[520px] bg-panel border border-borderHard rounded-[22px] px-8 py-[30px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="why-pots-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start gap-4">
          <div id="why-pots-title" className="font-bold text-[20px]">
            Why two separate pots?
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-[32px] h-[32px] rounded-md border border-border flex items-center justify-center text-muted hover:text-ink hover:bg-panel2 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-2 font-mono text-[11px] text-muted">§20 Abs. 6 EStG</div>

        {/* Byte-identical to tax-buckets-card.tsx's header copy — do not reword. */}
        <div className="mt-4 text-[13px] text-muted leading-relaxed">
          Share losses can only offset <span className="text-ink">share gains</span> — never ETF gains,
          dividends or interest. Each pot is taxed on its own.
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2.5">
          <div className="bg-panel2 rounded-2xl p-3.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-dim uppercase tracking-widest">Aktien</span>
              <span className="font-mono text-[10px] text-dim">Einzelaktien</span>
            </div>
          </div>
          <div className="bg-panel2 rounded-2xl p-3.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-dim uppercase tracking-widest">Sonstige</span>
              <span className="font-mono text-[10px] text-dim">ETFs · bonds · income</span>
            </div>
          </div>
        </div>

        {/* Byte-identical to the carryforward Row's title/tooltip text in
            tax-buckets-card.tsx — do not reword. */}
        <div className="mt-4 text-[13px] text-muted leading-relaxed">
          Unusable this year. Carried forward and may only ever offset FUTURE share gains (§20 Abs. 6 S.
          4). It does not reduce this year&apos;s tax.
        </div>
      </div>
    </div>
  );
}
