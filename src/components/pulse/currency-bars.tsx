export function CurrencyBars({ data }: { data: { code: string; pct: number; flag?: string }[] }) {
  const palette = ["#7CFFB2", "#FFD24A", "#FF5DA2", "#6FE8FF", "#B59CFF"];
  return (
    <ul className="space-y-2.5">
      {data.map((c, i) => (
        <li key={c.code}>
          <div className="flex justify-between font-mono text-xs mb-1">
            <span className="text-ink">{c.flag ?? ""} {c.code}</span>
            <span className="text-muted">{c.pct.toFixed(1)}%</span>
          </div>
          <div className="h-1 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.min(100, c.pct)}%`, background: palette[i % palette.length] }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
