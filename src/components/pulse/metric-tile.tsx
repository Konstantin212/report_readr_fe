import { Card } from "./card";

export function MetricTile({
  label, value, sublabel, accent,
}: { label: string; value: string; sublabel?: string; accent?: "mint" | "amber" | "ink" | "bad" }) {
  const color =
    accent === "mint" ? "text-mint" :
    accent === "amber" ? "text-amber" :
    accent === "bad" ? "text-bad" :
    "text-ink";
  return (
    <Card>
      <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{label}</div>
      <div className={`font-bold text-[26px] mt-1.5 num ${color}`}>{value}</div>
      {sublabel && <div className="font-mono text-[10px] text-muted mt-0.5">{sublabel}</div>}
    </Card>
  );
}
