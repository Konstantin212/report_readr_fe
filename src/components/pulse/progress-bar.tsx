export function ProgressBar({
  pct,
  fill = "var(--accent-mint, #7CFFB2)",
  height = 8,
}: { pct: number; fill?: string; height?: number }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className="bg-white/5 rounded-full overflow-hidden" style={{ height }}>
      <div className="h-full rounded-full" style={{ width: `${w}%`, background: fill }} />
    </div>
  );
}
