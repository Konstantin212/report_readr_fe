export function ToggleRow({
  label, sub, on,
}: { label: string; sub?: string; on: boolean }) {
  return (
    <div className="bg-panel2 rounded-[12px] p-3.5 flex justify-between items-center gap-3">
      <div>
        <div className="text-[13px] text-ink">{label}</div>
        {sub && <div className="font-mono text-[11px] text-muted mt-0.5">{sub}</div>}
      </div>
      <div className={`w-9 h-5 rounded-full relative shrink-0 ${on ? "bg-mint" : "bg-white/10"}`}>
        <div className={`absolute top-0.5 ${on ? "left-[18px]" : "left-0.5"} w-4 h-4 rounded-full transition-[left] duration-150 ${on ? "bg-bg" : "bg-white"}`} />
      </div>
    </div>
  );
}
