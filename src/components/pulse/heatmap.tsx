import { Card } from "./card";
import type { HeatmapRow } from "@/lib/analytics/monthly-heatmap";

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

function colorFor(v: number): { bg: string; fg: string } {
  // v is a fraction (0.024 = 2.4%)
  const pct = v * 100;
  if (pct >= 4) return { bg: "var(--accent-mint, #7CFFB2)", fg: "#0b0d10" };
  if (pct >= 2) return { bg: "rgba(124,255,178,0.67)", fg: "#0b0d10" };
  if (pct >= 0) return { bg: "rgba(124,255,178,0.33)", fg: "#0b0d10" };
  if (pct >= -1.5) return { bg: "rgba(255,111,111,0.33)", fg: "#fff" };
  return { bg: "rgba(255,111,111,0.67)", fg: "#fff" };
}

export function Heatmap({ rows, hideEmpty = true }: { rows: HeatmapRow[]; hideEmpty?: boolean }) {
  if (rows.length === 0) {
    return <div className="text-muted text-sm py-6">Not enough monthly data yet.</div>;
  }
  // Compute stats for footer
  const flat = rows.flatMap((r) => r.months.map((m, i) => ({ year: r.year, m: i, v: m })));
  const nonzero = flat.filter((x) => x.v !== 0);
  const best = nonzero.length ? nonzero.reduce((a, b) => (a.v > b.v ? a : b)) : null;
  const worst = nonzero.length ? nonzero.reduce((a, b) => (a.v < b.v ? a : b)) : null;
  const positives = nonzero.filter((x) => x.v > 0).length;
  const total = nonzero.length;

  return (
    <Card>
      <div className="flex justify-between items-baseline mb-3">
        <div className="font-semibold text-sm">Monthly returns</div>
        <div className="flex items-center gap-2 font-mono text-[10px] text-dim tracking-widest">
          <span>−2%</span>
          <span className="flex gap-0.5">
            <span className="w-3.5 h-2 bg-bad/70" />
            <span className="w-3.5 h-2 bg-bad/30" />
            <span className="w-3.5 h-2 bg-mint/30" />
            <span className="w-3.5 h-2 bg-mint/70" />
            <span className="w-3.5 h-2 bg-mint" />
          </span>
          <span>+5%</span>
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="grid grid-cols-[40px_repeat(12,1fr)] gap-1 font-mono text-[9px] text-dim tracking-wide">
          <span />
          {MONTHS.map((m) => <span key={m} className="text-center">{m}</span>)}
        </div>
        {rows.map((row) => (
          <div key={row.year} className="grid grid-cols-[40px_repeat(12,1fr)] gap-1 items-center">
            <span className="font-mono text-xs text-muted font-semibold">{row.year}</span>
            {row.months.map((v, i) => {
              const { bg, fg } = colorFor(v);
              const isEmpty = v === 0 && hideEmpty;
              return (
                <div
                  key={i}
                  className="rounded flex items-center justify-center font-mono text-[10px] font-semibold"
                  style={{
                    aspectRatio: "1 / 1",
                    background: isEmpty ? "rgba(255,255,255,0.03)" : bg,
                    color: isEmpty ? "rgba(236,238,242,0.25)" : fg,
                  }}
                >
                  {isEmpty ? "" : (v >= 0 ? "+" : "") + (v * 100).toFixed(1)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {best && worst && (
        <div className="flex justify-between mt-4 pt-3 border-t border-border font-mono text-[11px] text-muted">
          <span>Best month <span className="text-mint font-semibold">{labelMonth(best.year, best.m)} {fmt(best.v)}</span></span>
          <span>Worst month <span className="text-bad font-semibold">{labelMonth(worst.year, worst.m)} {fmt(worst.v)}</span></span>
          <span>Hit rate <span className="text-ink font-semibold">{positives}/{total}</span></span>
        </div>
      )}
    </Card>
  );
}

function labelMonth(year: number, m: number) {
  const short = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m];
  return `${short} '${String(year).slice(-2)}`;
}
function fmt(v: number) {
  return (v >= 0 ? "+" : "") + (v * 100).toFixed(1) + "%";
}
