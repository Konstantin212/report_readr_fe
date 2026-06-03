"use client";
import { useEffect, useRef, useState } from "react";
import { AreaChart, Area, LineChart, Line, BarChart, Bar, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/**
 * Performance chart wrapper around Recharts. Adds two things the bare
 * Recharts components don't:
 *
 * 1. Mobile-tooltip-dismissal. Recharts' default behavior on a touch
 *    device is to leave the tooltip onscreen after the user lifts their
 *    finger — there's no `onPointerLeave` because no pointer is hovering.
 *    We listen for `touchend` and any tap outside the chart and force the
 *    Tooltip's `active` prop off. This was the "stuck IQ v:101.17…" bug.
 * 2. Custom Tooltip content so the popover never overflows the viewport
 *    on a narrow phone (Recharts' default is a 200px+ light card with
 *    `pointerEvents: none`).
 */

type Style = "line" | "area" | "bars";

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value?: number; dataKey?: string }> }) {
  if (!active || !payload || payload.length === 0) return null;
  const main = payload.find((p) => p.dataKey === "v") ?? payload[0];
  const bench = payload.find((p) => p.dataKey === "b");
  return (
    <div className="bg-panel border border-borderHard rounded-md px-2 py-1.5 font-mono text-[10px] shadow-lg">
      <div className="text-ink">
        {typeof main?.value === "number" ? main.value.toFixed(2) : "—"}
      </div>
      {bench && typeof bench.value === "number" && (
        <div className="text-muted">bench {bench.value.toFixed(2)}</div>
      )}
    </div>
  );
}

export function PerfChart({
  values, benchmark, style = "area", strokeColor = "#7CFFB2",
}: { values: number[]; benchmark?: number[]; style?: Style; strokeColor?: string }) {
  const data = values.map((v, i) => ({ i, v, b: benchmark?.[i] }));
  const containerRef = useRef<HTMLDivElement>(null);
  const [forceHide, setForceHide] = useState(false);

  // Dismiss any active tooltip on tap outside the chart OR on touch-end.
  // Recharts checks `active` lazily via its own mouse tracking; we force
  // the Tooltip back off by re-mounting via a key bump.
  const [tipKey, setTipKey] = useState(0);
  useEffect(() => {
    function dismissOnTapOutside(e: TouchEvent | MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setForceHide(true);
        setTipKey((k) => k + 1);
      }
    }
    function dismissOnTouchEnd() {
      // Give Recharts a beat to fire its own state then yank the tooltip.
      setTimeout(() => {
        setForceHide(true);
        setTipKey((k) => k + 1);
      }, 100);
    }
    document.addEventListener("touchstart", dismissOnTapOutside, { passive: true });
    document.addEventListener("mousedown", dismissOnTapOutside);
    containerRef.current?.addEventListener("touchend", dismissOnTouchEnd, { passive: true });
    const node = containerRef.current;
    return () => {
      document.removeEventListener("touchstart", dismissOnTapOutside);
      document.removeEventListener("mousedown", dismissOnTapOutside);
      node?.removeEventListener("touchend", dismissOnTouchEnd);
    };
  }, []);

  const tooltipEl = forceHide ? <></> : <Tooltip key={tipKey} content={<ChartTooltip />} cursor={false} />;

  const onPointerDown = () => setForceHide(false);

  if (style === "line") {
    return (
      <div ref={containerRef} className="w-full h-full" onPointerDown={onPointerDown}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <Line type="monotone" dataKey="v" stroke={strokeColor} strokeWidth={2.5} dot={false} />
            {benchmark && <Line type="monotone" dataKey="b" stroke="rgba(255,255,255,0.5)" strokeDasharray="4 4" dot={false} />}
            {tooltipEl}
            <XAxis dataKey="i" hide />
            <YAxis hide domain={["auto", "auto"]} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }
  if (style === "bars") {
    return (
      <div ref={containerRef} className="w-full h-full" onPointerDown={onPointerDown}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <Bar dataKey="v" fill={strokeColor} radius={6} />
            {tooltipEl}
            <XAxis dataKey="i" hide />
            <YAxis hide domain={["auto", "auto"]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }
  return (
    <div ref={containerRef} className="w-full h-full" onPointerDown={onPointerDown}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <Area type="monotone" dataKey="v" stroke={strokeColor} fill={strokeColor + "33"} strokeWidth={2.5} />
          {benchmark && <Line type="monotone" dataKey="b" stroke="rgba(255,255,255,0.5)" strokeDasharray="4 4" dot={false} />}
          {tooltipEl}
          <XAxis dataKey="i" hide />
          <YAxis hide domain={["auto", "auto"]} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
