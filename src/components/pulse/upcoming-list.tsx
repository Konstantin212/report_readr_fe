export type UpcomingItem = { date: string; ticker: string; amountEur: number; ccy?: string };

export function UpcomingList({ items }: { items: UpcomingItem[] }) {
  if (items.length === 0) return <div className="text-muted text-sm">No upcoming distributions.</div>;
  const fmtEur = (v: number) => `€${v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return (
    <>
      {items.map((u, i) => (
        <div key={i} className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
          <div className="w-11 py-1 text-center rounded-md bg-panel2 font-mono text-[11px] text-mint tracking-wider">{u.date}</div>
          <div className="flex-1">
            <div className="font-semibold text-[13px]">{u.ticker}</div>
            {u.ccy && <div className="font-mono text-[10px] text-muted">{u.ccy} · ex-date confirmed</div>}
          </div>
          <div className="font-mono font-semibold text-amber">{fmtEur(u.amountEur)}</div>
        </div>
      ))}
    </>
  );
}
