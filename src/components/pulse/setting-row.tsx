export function SettingRow({
  label, value, highlight, last,
}: { label: string; value: string; highlight?: boolean; last?: boolean }) {
  return (
    <div className={`flex justify-between items-center py-2.5 ${last ? "" : "border-b border-border"}`}>
      <span className="text-[13px] text-muted">{label}</span>
      <span className={`font-mono text-[13px] ${highlight ? "text-mint" : "text-ink"}`}>{value}</span>
    </div>
  );
}
