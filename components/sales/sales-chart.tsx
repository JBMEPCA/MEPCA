"use client";

import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

export type MonthlySales = { month: string; label: string; total: number; count: number };

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

export function SalesChart({ data }: { data: MonthlySales[] }) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="salesBar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.95} />
              <stop offset="100%" stopColor="#0e7490" stopOpacity={0.7} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,197,255,0.08)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `£${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`}
            width={44}
          />
          <Tooltip
            cursor={{ fill: "rgba(34,211,238,0.06)" }}
            contentStyle={{
              background: "#0f172a",
              border: "1px solid rgba(34,211,238,0.3)",
              borderRadius: 10,
              color: "#e2e8f0",
              fontSize: 12,
            }}
            formatter={(value) => [gbp.format(Number(value)), "Sales"]}
          />
          <Bar dataKey="total" fill="url(#salesBar)" radius={[6, 6, 0, 0]} maxBarSize={38} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
