import { Card } from "./card";

export type SectorBar = { sector: string; pctOfTotal: number; valueEur: number; topSymbols: string[] };

export function SectorContributionBars({ bars }: { bars: SectorBar[] }) {
  if (bars.length === 0) {
    return <Card><div className="text-muted text-sm">No data yet.</div></Card>;
  }
  const maxAbs = Math.max(...bars.map((b) => Math.abs(b.pctOfTotal)), 1);
  return (
    <Card>
      <div className="font-semibold text-sm mb-3">Contribution by sector</div>
      {bars.map((row) => {
        const positive = row.pctOfTotal >= 0;
        const width = (Math.abs(row.pctOfTotal) / maxAbs) * 100;
        return (
          <div key={row.sector} className="mb-2.5">
            <div className="flex justify-between font-mono text-xs mb-1">
              <span className="text-ink">
                {row.sector}{" "}
                <span className="text-dim text-[10px] ml-1">{row.topSymbols.slice(0, 3).join(", ")}</span>
              </span>
              <span className={`font-semibold ${positive ? "text-mint" : "text-bad"}`}>
                {(positive ? "+" : "") + row.pctOfTotal.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center h-1.5 bg-white/5 rounded-full">
              <div className="w-1/2 flex justify-end">
                {!positive && (
                  <div className="h-full bg-bad rounded-l-full" style={{ width: `${width}%` }} />
                )}
              </div>
              <div className="w-1/2">
                {positive && (
                  <div className="h-full bg-mint rounded-r-full" style={{ width: `${width}%` }} />
                )}
              </div>
            </div>
          </div>
        );
      })}
    </Card>
  );
}
