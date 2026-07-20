import { Card } from "report-readr-fe";
import { Frame } from "./_frame";

/**
 * The base surface everything in Folio sits on: `bg-panel`, a hairline
 * border, 22px radius, 22px padding.
 */
export function Default() {
  return (
    <Frame className="max-w-md">
      <Card>
        <div className="font-semibold text-sm text-ink">Portfolio value</div>
        <div className="text-[13px] text-muted mt-1.5">
          Across 3 brokers, valued at yesterday&apos;s close.
        </div>
      </Card>
    </Frame>
  );
}

/** A titled section — the most common composition on /positions and /tax. */
export function WithHeader() {
  return (
    <Frame className="max-w-lg">
      <Card>
        <div className="flex justify-between items-baseline mb-4">
          <div className="font-semibold text-base text-ink">Allocation</div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
            by sector
          </div>
        </div>
        <div className="space-y-2.5">
          {[
            ["Technology", "38.2%"],
            ["Financials", "21.7%"],
            ["Healthcare", "14.0%"],
            ["Energy", "9.4%"],
          ].map(([sector, pct]) => (
            <div key={sector} className="flex justify-between items-baseline">
              <span className="text-[13px] text-ink">{sector}</span>
              <span className="font-mono text-[13px] text-muted num">{pct}</span>
            </div>
          ))}
        </div>
      </Card>
    </Frame>
  );
}

/** Flush variant — `p-0` plus a bordered header, as DataTable composes it. */
export function Flush() {
  return (
    <Frame className="max-w-lg">
      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <div className="font-semibold text-sm text-ink">Recent imports</div>
          <div className="font-mono text-[11px] text-muted mt-0.5">
            3 files · last 30 days
          </div>
        </div>
        <div className="divide-y divide-border">
          {[
            ["U13142092_2025.csv", "Interactive Brokers", "1,284 rows"],
            ["201743_2025_all.json", "Freedom Finance", "612 rows"],
            ["trading_account.xlsx", "Revolut", "210 rows"],
          ].map(([file, broker, rows]) => (
            <div key={file} className="px-5 py-3 flex justify-between items-baseline gap-3">
              <div className="min-w-0">
                <div className="font-mono text-[12px] text-ink truncate">{file}</div>
                <div className="text-[11px] text-muted mt-0.5">{broker}</div>
              </div>
              <div className="font-mono text-[11px] text-dim shrink-0 num">{rows}</div>
            </div>
          ))}
        </div>
      </Card>
    </Frame>
  );
}
