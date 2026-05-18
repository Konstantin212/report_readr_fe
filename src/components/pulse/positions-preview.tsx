export type PositionPreviewRow = {
  symbol: string;
  name?: string;
  broker?: string;
  marketEur: number;
  plEur: number | null;
  plPct: number | null;
};

export function PositionsPreview({ rows }: { rows: PositionPreviewRow[] }) {
  return (
    <div>
      <div className="grid grid-cols-[1.4fr_0.6fr_0.8fr_0.8fr_0.6fr] gap-1.5 font-mono text-[10px] text-dim tracking-widest uppercase pb-1.5 border-b border-border">
        <span>Ticker</span>
        <span>Broker</span>
        <span className="text-right">Value</span>
        <span className="text-right">P/L</span>
        <span className="text-right">%</span>
      </div>
      {rows.length === 0 && (
        <div className="py-4 text-muted text-sm">No positions yet.</div>
      )}
      {rows.map((p) => (
        <div
          key={p.symbol}
          className="grid grid-cols-[1.4fr_0.6fr_0.8fr_0.8fr_0.6fr] gap-1.5 py-2.5 border-b border-border last:border-0 items-center font-mono text-xs"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-ink font-semibold">{p.symbol}</span>
            {p.name && <span className="text-dim text-[10px] truncate">{p.name}</span>}
          </div>
          <span className="text-muted text-[11px]">{p.broker ?? "—"}</span>
          <span className="text-right text-ink">€{p.marketEur.toLocaleString("de-DE", { maximumFractionDigits: 0 })}</span>
          <span className={`text-right ${p.plEur === null ? "text-muted" : p.plEur >= 0 ? "text-mint" : "text-bad"}`}>
            {p.plEur === null ? "—" : (p.plEur >= 0 ? "+€" : "−€") + Math.abs(p.plEur).toLocaleString("de-DE", { maximumFractionDigits: 0 })}
          </span>
          <span className={`text-right ${p.plPct === null ? "text-muted" : p.plPct >= 0 ? "text-mint" : "text-bad"}`}>
            {p.plPct === null ? "—" : (p.plPct >= 0 ? "+" : "") + p.plPct.toFixed(1) + "%"}
          </span>
        </div>
      ))}
    </div>
  );
}
