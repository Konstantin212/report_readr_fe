"use client";
import { AreaChart, Area, ResponsiveContainer } from "recharts";

export function Sparkline({ values, strokeColor = "var(--accent-mint, #7CFFB2)" }: { values: number[]; strokeColor?: string }) {
  if (values.length < 2) {
    return <div className="text-muted text-xs">—</div>;
  }
  const data = values.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Area type="monotone" dataKey="v" stroke={strokeColor} fill={strokeColor + "33"} strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
