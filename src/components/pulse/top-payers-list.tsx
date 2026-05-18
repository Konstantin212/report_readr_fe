import type { TopPayer } from "@/lib/analytics/top-payers";

export function TopPayersList({ items }: { items: (TopPayer & { yieldPct?: number; name?: string })[] }) {
  if (items.length === 0) return <div className="text-muted text-sm">No dividend history yet.</div>;
  return (
    <>
      {items.map((t, i) => (
        <div key={t.ticker} className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
          <div className="w-7 h-7 rounded-md bg-panel2 text-mint font-mono font-bold text-[10px] flex items-center justify-center">{i + 1}</div>
          <div className="flex-1">
            <div className="font-semibold text-[13px]">{t.ticker}</div>
            {t.name && <div className="font-mono text-[10px] text-muted">{t.name}</div>}
          </div>
          <div className="text-right">
            <div className="font-mono font-semibold text-amber">€{t.totalEur.toFixed(0)}</div>
            {t.yieldPct !== undefined && <div className="font-mono text-[10px] text-dim">{t.yieldPct.toFixed(1)}% YoC</div>}
          </div>
        </div>
      ))}
    </>
  );
}
