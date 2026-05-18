"use client";
import { AreaChart, Area, LineChart, Line, BarChart, Bar, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function PerfChart({
  values, benchmark, style = "area", strokeColor = "#7CFFB2",
}: { values: number[]; benchmark?: number[]; style?: "line" | "area" | "bars"; strokeColor?: string }) {
  const data = values.map((v, i) => ({ i, v, b: benchmark?.[i] }));
  if (style === "line") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <Line type="monotone" dataKey="v" stroke={strokeColor} strokeWidth={2.5} dot={false} />
          {benchmark && <Line type="monotone" dataKey="b" stroke="rgba(255,255,255,0.5)" strokeDasharray="4 4" dot={false} />}
          <Tooltip />
          <XAxis dataKey="i" hide />
          <YAxis hide domain={["auto", "auto"]} />
        </LineChart>
      </ResponsiveContainer>
    );
  }
  if (style === "bars") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <Bar dataKey="v" fill={strokeColor} radius={6} />
          <Tooltip />
          <XAxis dataKey="i" hide />
          <YAxis hide domain={["auto", "auto"]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <Area type="monotone" dataKey="v" stroke={strokeColor} fill={strokeColor + "33"} strokeWidth={2.5} />
        {benchmark && <Line type="monotone" dataKey="b" stroke="rgba(255,255,255,0.5)" strokeDasharray="4 4" dot={false} />}
        <Tooltip />
        <XAxis dataKey="i" hide />
        <YAxis hide domain={["auto", "auto"]} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
