import { Donut } from "./donut";

export function AllocationDonut({
  data,
  colors = ["#7CFFB2", "#FFD24A", "#FF5DA2", "#6FE8FF", "#B59CFF", "#FFA56C", "#7BA4FF", "rgba(236,238,242,0.35)"],
  centerLabel,
  centerSublabel,
}: {
  data: { name: string; pct: number; value?: number }[];
  colors?: string[];
  centerLabel?: string;
  centerSublabel?: string;
}) {
  return (
    <div className="flex gap-5 items-center">
      <div className="relative shrink-0">
        <Donut data={data} colors={colors} />
        {centerLabel && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {centerSublabel && (
              <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{centerSublabel}</div>
            )}
            <div className="font-bold text-lg num">{centerLabel}</div>
          </div>
        )}
      </div>
      <ul className="flex-1 space-y-1.5">
        {data.slice(0, 6).map((d, i) => (
          <li key={d.name} className="flex items-center gap-2 font-mono text-xs">
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: colors[i % colors.length] }} />
            <span className="flex-1 text-ink truncate">{d.name}</span>
            <span className="text-muted num">{d.pct.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
