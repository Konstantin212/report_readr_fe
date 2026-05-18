"use client";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

export function Donut({ data, colors }: { data: { name: string; pct: number }[]; colors: string[] }) {
  return (
    <ResponsiveContainer width={140} height={140}>
      <PieChart>
        <Pie data={data} dataKey="pct" innerRadius={48} outerRadius={66} stroke="none">
          {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
