"use client";

import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

export function TrafficChart({ data }: { data: { date: string; sessions: number }[] }) {
  const formatted = data.map((d) => ({
    ...d,
    label: `${d.date.slice(6, 8)}/${d.date.slice(4, 6)}`,
  }));
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={formatted} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="traffic" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,197,255,0.08)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval={Math.floor(formatted.length / 8)}
          />
          <YAxis
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip
            contentStyle={{
              background: "#0f172a",
              border: "1px solid rgba(34,211,238,0.3)",
              borderRadius: 10,
              color: "#e2e8f0",
              fontSize: 12,
            }}
            formatter={(value) => [Number(value).toLocaleString(), "Sessions"]}
          />
          <Area
            type="monotone"
            dataKey="sessions"
            stroke="#22d3ee"
            strokeWidth={2}
            fill="url(#traffic)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
