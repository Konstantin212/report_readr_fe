import { Card } from "./card";
import { Sparkline } from "./sparkline";

export type Lot = {
  openedAt: string;
  qty: string;
  costEur: string;
  pricePerUnitEur: string;
  pctOfTotal: number;
  gainPct: number | null;
};

export type DetailData = {
  symbol: string;
  name?: string;
  broker: string;
  sector: string;
  currency: string;
  marketEur: number;
  qty: number;
  pricePerUnitEur: number;
  unrealizedEur: number;
  unrealizedPct: number | null;
  avgCostEur: number;
  sparkline: number[];
  sparkPctChange?: number | null;
  lots: Lot[];
  dividendsYtdEur: number;
  yieldOnCostPct: number;
  daysHeld: number;
};

export function PositionDetailPanel({ d }: { d: DetailData }) {
  const fmtEur = (v: number, dec = 2) => `€${Math.abs(v).toLocaleString("de-DE", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
  const palette = ["var(--accent-mint, #7CFFB2)", "var(--accent-amber, #FFD24A)", "var(--accent-pink, #FF5DA2)"];
  return (
    <Card>
      <div className="flex items-start gap-3 mb-4">
        <div className="w-14 h-14 rounded-[14px] bg-mint/20 text-mint font-mono font-bold text-[16px] flex items-center justify-center">{d.symbol.slice(0,3)}</div>
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <div className="font-bold text-[22px] tracking-tight">{d.symbol}</div>
            <div className="px-2 py-0.5 rounded-full bg-panel2 font-mono text-[10px] text-muted tracking-wider">
              {d.broker} · {d.currency} · {d.sector}
            </div>
          </div>
          {d.name && <div className="font-medium text-[13px] text-muted mt-0.5">{d.name}</div>}
        </div>
        <button className="border border-borderHard text-ink px-3 py-1.5 rounded-md font-mono text-[11px] uppercase tracking-widest opacity-50 cursor-not-allowed">＋ Add lot</button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <div className="font-mono text-[10px] text-dim uppercase tracking-widest">Position value</div>
          <div className="font-bold text-[28px] num mt-1 tracking-tight">{fmtEur(d.marketEur)}</div>
          <div className="font-mono text-[11px] text-muted mt-1">{d.qty} × {fmtEur(d.pricePerUnitEur, 2)}</div>
        </div>
        <div>
          <div className="font-mono text-[10px] text-dim uppercase tracking-widest">Unrealized P/L</div>
          <div className={`font-bold text-[28px] num mt-1 tracking-tight ${d.unrealizedEur >= 0 ? "text-mint" : "text-bad"}`}>
            {(d.unrealizedEur >= 0 ? "+" : "−") + fmtEur(d.unrealizedEur)}
          </div>
          <div className="font-mono text-[11px] text-muted mt-1">
            {d.unrealizedPct === null ? "—" : (d.unrealizedPct >= 0 ? "+" : "") + d.unrealizedPct.toFixed(1) + "%"} from {fmtEur(d.avgCostEur, 2)}
          </div>
        </div>
      </div>

      <div className="bg-panel2 rounded-[14px] p-3 mb-4">
        <div className="flex justify-between items-baseline mb-1">
          <span className="font-mono text-[10px] text-dim uppercase tracking-widest">Price · history</span>
          {d.sparkPctChange !== null && d.sparkPctChange !== undefined && (
            <span className={`font-mono text-[11px] font-semibold ${d.sparkPctChange >= 0 ? "text-mint" : "text-bad"}`}>
              {(d.sparkPctChange >= 0 ? "+" : "") + d.sparkPctChange.toFixed(1)}%
            </span>
          )}
        </div>
        <div className="h-[70px]"><Sparkline values={d.sparkline} /></div>
      </div>

      <div className="mb-4">
        <div className="font-semibold text-[13px] mb-2">Cost basis · FIFO lots</div>
        {d.lots.length === 0 && <div className="text-muted text-sm">No lots data.</div>}
        {d.lots.map((l, i) => {
          const color = palette[i % palette.length];
          return (
            <div key={i} className="mb-2">
              <div className="flex justify-between font-mono text-[11px] mb-0.5">
                <span className="text-muted">{l.openedAt}</span>
                <span className="text-ink">{l.qty} sh @ €{l.pricePerUnitEur}</span>
                {l.gainPct !== null && <span className={`font-semibold ${l.gainPct >= 0 ? "text-mint" : "text-bad"}`}>
                  {(l.gainPct >= 0 ? "+" : "") + l.gainPct.toFixed(0)}%
                </span>}
              </div>
              <div className="h-1 bg-white/5 rounded-full">
                <div className="h-full rounded-full" style={{ width: `${l.pctOfTotal}%`, background: color }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-panel2 rounded-md p-2.5">
          <div className="font-mono text-[10px] text-dim uppercase tracking-widest">Dividends YTD</div>
          <div className="font-bold text-[16px] num text-amber mt-0.5">€{d.dividendsYtdEur.toFixed(0)}</div>
        </div>
        <div className="bg-panel2 rounded-md p-2.5">
          <div className="font-mono text-[10px] text-dim uppercase tracking-widest">Yield on cost</div>
          <div className="font-bold text-[16px] num mt-0.5">{d.yieldOnCostPct.toFixed(1)}%</div>
        </div>
        <div className="bg-panel2 rounded-md p-2.5">
          <div className="font-mono text-[10px] text-dim uppercase tracking-widest">Days held</div>
          <div className="font-bold text-[16px] num mt-0.5">{d.daysHeld}</div>
        </div>
      </div>
    </Card>
  );
}
