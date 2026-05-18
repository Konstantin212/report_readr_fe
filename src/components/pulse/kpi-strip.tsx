import { Card } from "./card";

export type KpiStripItem = { label: string; value: string; sublabel?: string; accent?: "mint" | "amber" | "bad" | "ink" };

export function KpiStrip({ items }: { items: KpiStripItem[] }) {
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((m, i) => {
        const color =
          m.accent === "mint" ? "text-mint" :
          m.accent === "amber" ? "text-amber" :
          m.accent === "bad" ? "text-bad" : "text-ink";
        return (
          <Card key={i}>
            <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{m.label}</div>
            <div className={`font-bold text-[28px] mt-2 num leading-tight ${color}`}>{m.value}</div>
            {m.sublabel && <div className="font-mono text-[10px] text-muted mt-1">{m.sublabel}</div>}
          </Card>
        );
      })}
    </div>
  );
}
