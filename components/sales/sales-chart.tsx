"use client";

import {
  Bar, CartesianGrid, Cell, ComposedChart, ReferenceLine,
  ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis,
} from "recharts";

export type MonthlySales = {
  month: string;
  label: string;
  total: number;
  count: number;
  future: boolean;
  target?: number | null; // red dash on the bar — 2026 months only
};

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

// A straight dashed red line across one bar at its target height
function TargetDash(props: unknown) {
  const { cx, cy } = props as { cx?: number; cy?: number };
  if (cx == null || cy == null) return null;
  return (
    <line
      x1={cx - 16} x2={cx + 16} y1={cy} y2={cy}
      stroke="#f87171" strokeWidth={2.5} strokeDasharray="5 3"
    />
  );
}

export function SalesChart({
  data,
  revenueLabel = "Issue revenue",
}: {
  data: MonthlySales[];
  revenueLabel?: string;
}) {
  const nowLabel = data.find((d) => d.future)?.label;
  const hasTarget = data.some((d) => d.target != null);
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {/* top margin leaves room for the "upcoming" reference-line label */}
        <ComposedChart data={data} margin={{ top: 24, right: 8, left: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="pastBar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.95} />
              <stop offset="100%" stopColor="#0e7490" stopOpacity={0.7} />
            </linearGradient>
            <linearGradient id="futureBar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.9} />
              <stop offset="100%" stopColor="#6d28d9" stopOpacity={0.6} />
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
            // Recharts defaults item/label text to black — unreadable on the
            // dark tooltip, so set both explicitly.
            itemStyle={{ color: "#e2e8f0" }}
            labelStyle={{ color: "#94a3b8" }}
            formatter={(value, name) => [
              gbp.format(Number(value)),
              name === "target" ? "Target" : revenueLabel,
            ]}
          />
          {nowLabel && (
            <ReferenceLine
              x={nowLabel}
              stroke="rgba(167,139,250,0.5)"
              strokeDasharray="4 4"
              label={{ value: "upcoming", fill: "#a78bfa", fontSize: 10, position: "top" }}
            />
          )}
          <Bar dataKey="total" radius={[6, 6, 0, 0]} maxBarSize={38}>
            {data.map((entry) => (
              <Cell key={entry.month} fill={entry.future ? "url(#futureBar)" : "url(#pastBar)"} />
            ))}
          </Bar>
          {hasTarget && (
            <Scatter dataKey="target" shape={TargetDash} isAnimationActive={false} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
