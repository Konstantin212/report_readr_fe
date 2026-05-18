export function DividendMiniBars({ values, months }: { values: number[]; months: string[] }) {
  const max = Math.max(...values, 1);
  return (
    <div>
      <div className="flex gap-1 items-end h-[60px]">
        {values.map((v, i) => (
          <div
            key={i}
            className="flex-1 rounded"
            style={{
              height: `${(v / max) * 100}%`,
              minHeight: v > 0 ? "2px" : "0",
              background: i === values.length - 1 ? "var(--accent-amber, #FFD24A)" : "rgba(255,210,74,0.4)",
            }}
          />
        ))}
      </div>
      <div className="flex justify-between font-mono text-[10px] text-dim mt-1.5 tracking-widest">
        {months.length > 0 && <span>{months[0]}</span>}
        {months.length > 0 && <span>{months[months.length - 1]}</span>}
      </div>
    </div>
  );
}
