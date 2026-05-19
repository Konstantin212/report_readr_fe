import { Card } from "./card";
import type { CashByCurrency } from "@/lib/data/cash";

export function CashCard({ balances }: { balances: CashByCurrency[] }) {
  if (balances.length === 0) return null;
  const totalEur = balances.reduce((s, b) => s + b.amountEur, 0);
  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex justify-between items-baseline px-5 py-3 border-b border-border">
        <div className="font-semibold text-sm">Cash</div>
        <div className="font-mono text-[11px] text-muted tracking-wider">
          ≈ €{totalEur.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>
      <div className="grid grid-cols-[1fr_1fr_1fr] gap-0 px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-dim border-b border-border">
        <span>Currency</span>
        <span className="text-right">Balance</span>
        <span className="text-right">EUR equiv.</span>
      </div>
      {balances.map(b => (
        <div key={b.currency} className="grid grid-cols-[1fr_1fr_1fr] gap-0 px-5 py-3 items-center font-mono text-xs border-b border-border last:border-0">
          <div className="flex items-center gap-2">
            {b.flag && <span className="text-base">{b.flag}</span>}
            <span className="font-semibold">{b.currency}</span>
          </div>
          <span className="text-right">{b.amount.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <span className="text-right text-muted">€{b.amountEur.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      ))}
    </Card>
  );
}
