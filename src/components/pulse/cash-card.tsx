import { Card } from "./card";
import type { CashByCurrency } from "@/lib/data/cash";

export function CashCard({ balances }: { balances: CashByCurrency[] }) {
  if (balances.length === 0) return null;
  const totalEur = balances.reduce((s, b) => s + b.amountEur, 0);
  const fmt = (v: number) => v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex justify-between items-center px-6 py-[18px] border-b border-border">
        <div className="font-semibold text-base">Cash</div>
        <div className={`font-mono text-xs tracking-wider ${totalEur < 0 ? "text-bad" : "text-ink"}`}>
          ≈ €{fmt(totalEur)}
        </div>
      </div>
      {balances.map(b => (
        <div key={b.currency} className="flex items-center justify-between gap-4 px-6 py-4 border-b border-border last:border-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-[34px] h-[34px] rounded-[10px] bg-panel2 flex items-center justify-center font-mono text-[11px] font-bold text-muted shrink-0">
              {b.currency.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex items-center gap-1.5 text-[15px] font-semibold truncate">
              {b.flag && <span className="text-base">{b.flag}</span>}
              {b.currency}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className={`font-mono text-[15px] ${b.amount < 0 ? "text-bad" : "text-ink"}`}>{fmt(b.amount)}</div>
            <div className="font-mono text-[12px] text-dim mt-0.5">≈ €{fmt(b.amountEur)}</div>
          </div>
        </div>
      ))}
    </Card>
  );
}
