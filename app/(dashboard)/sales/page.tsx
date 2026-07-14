import { db } from "@/lib/db";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SalesChart, type MonthlySales } from "@/components/sales/sales-chart";

export const dynamic = "force-dynamic";

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

export default async function SalesPage() {
  const campaigns = await db.campaign.findMany({
    where: { saleDate: { not: null }, value: { not: null } },
    select: { saleDate: true, value: true, brand: true, package: true, issue: true },
    orderBy: { saleDate: "asc" },
  });

  const byMonth = new Map<string, { total: number; count: number }>();
  let lifetime = 0;
  for (const c of campaigns) {
    const key = format(c.saleDate!, "yyyy-MM");
    const entry = byMonth.get(key) ?? { total: 0, count: 0 };
    entry.total += Number(c.value);
    entry.count += 1;
    byMonth.set(key, entry);
    lifetime += Number(c.value);
  }

  const now = new Date();
  const thisMonthKey = format(now, "yyyy-MM");
  const lastMonthKey = format(new Date(now.getFullYear(), now.getMonth() - 1, 1), "yyyy-MM");
  const thisYear = String(now.getFullYear());

  const months: MonthlySales[] = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      label: format(new Date(`${month}-01`), "MMM yy"),
      total: Math.round(v.total),
      count: v.count,
    }));

  const last24 = months.slice(-24);
  const ytd = months
    .filter((m) => m.month.startsWith(thisYear))
    .reduce((s, m) => s + m.total, 0);
  const thisMonth = byMonth.get(thisMonthKey)?.total ?? 0;
  const lastMonth = byMonth.get(lastMonthKey)?.total ?? 0;
  const momChange = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : null;
  const best = months.reduce(
    (top, m) => (m.total > top.total ? m : top),
    { label: "—", total: 0, month: "", count: 0 }
  );
  const monthsWithSales = months.length || 1;
  const average = lifetime / monthsWithSales;

  const recentSales = [...campaigns].reverse().slice(0, 10);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sales</h1>
        <p className="text-sm text-muted-foreground">
          Every booking from the FileMaker ledger onwards, by the month it was sold.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-primary/30 bg-primary/10 p-5">
          <div className="text-xs uppercase tracking-widest text-primary/80">Lifetime sales</div>
          <div className="mt-1 text-3xl font-bold text-primary">{gbp.format(lifetime)}</div>
          <div className="mt-1 text-xs text-muted-foreground">{campaigns.length} bookings</div>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">This year</div>
          <div className="mt-1 text-3xl font-bold">{gbp.format(ytd)}</div>
          <div className="mt-1 text-xs text-muted-foreground">{thisYear} to date</div>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">This month</div>
          <div className="mt-1 text-3xl font-bold">{gbp.format(thisMonth)}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {momChange === null
              ? "no sales last month"
              : `${momChange >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(momChange))}% vs last month`}
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Best month</div>
          <div className="mt-1 text-3xl font-bold">{gbp.format(best.total)}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {best.label} · avg {gbp.format(average)}/mo
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly sales — last 24 months</CardTitle>
        </CardHeader>
        <CardContent>
          <SalesChart data={last24} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Latest bookings</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {recentSales.map((c, i) => (
              <li key={i} className="flex items-center justify-between py-2 text-sm">
                <span>
                  <span className="font-medium">{c.brand}</span>{" "}
                  <span className="text-muted-foreground">
                    — {c.package}
                    {c.issue ? ` · ${c.issue} issue` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-4">
                  <span className="text-muted-foreground">
                    {c.saleDate ? format(c.saleDate, "d MMM yyyy") : ""}
                  </span>
                  <span className="min-w-16 text-right font-semibold text-primary">
                    {gbp.format(Number(c.value))}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
