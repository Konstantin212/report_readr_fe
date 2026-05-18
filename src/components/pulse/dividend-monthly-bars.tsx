export function DividendMonthlyBars({
  values,
  monthLabels,
  highlightIdx = -1,
}: { values: number[]; monthLabels: string[]; highlightIdx?: number }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-1.5 h-[200px]">
      {values.map((v, i) => {
        const isProjected = v === 0;
        const display = isProjected ? max * 0.5 : v;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
            <div
              className="w-full rounded-md flex items-start justify-center pt-1.5 font-mono text-[10px]"
              style={{
                height: `${(display / max) * 100}%`,
                background: isProjected ? "transparent" : i === highlightIdx ? "var(--accent-amber, #FFD24A)" : "rgba(255,210,74,0.4)",
                border: isProjected ? "1.5px dashed rgba(255,210,74,0.34)" : "none",
                color: isProjected ? "rgba(236,238,242,0.35)" : "#0b0d10",
              }}
            >
              {!isProjected && v > max * 0.5 && <span>{Math.round(v)}</span>}
            </div>
            <span className="font-mono text-[10px] text-muted tracking-wider">{monthLabels[i]}</span>
          </div>
        );
      })}
    </div>
  );
}
