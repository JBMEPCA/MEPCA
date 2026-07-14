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
    where: { startDate: { not: null } },
    select: {
      startDate: true, saleDate: true, value: true, brand: true, package: true, issue: true,
    },
  });

  // Revenue attributed to the issue each booking runs in
  const byIssueMonth = new Map<string, { total: number; count: number }>();
  let lifetime = 0;
  for (const c of campaigns) {
    const key = format(c.startDate!, "yyyy-MM");
    const entry = byIssueMonth.get(key) ?? { total: 0, count: 0 };
    entry.total += Number(c.value ?? 0);
    entry.count += 1;
    byIssueMonth.set(key, entry);
    lifetime += Number(c.value ?? 0);
  }

  const now = new Date();
  const thisMonthKey = format(now, "yyyy-MM");
  const thisYear = String(now.getFullYear());

  const months: MonthlySales[] = [...byIssueMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      label: format(new Date(`${month}-01`), "MMM yy"),
      total: Math.round(v.total),
      count: v.count,
      future: month > thisMonthKey,
    }));

  // Show the last 12 issues plus everything booked in the future
  const firstShown = Math.max(0, months.filter((m) => !m.future).length - 12);
  const chartData = months.slice(firstShown);

  const ytd = months
    .filter((m) => m.month.startsWith(thisYear))
    .reduce((s, m) => s + m.total, 0);
  const currentIssue = months.find((m) => m.month === thisMonthKey);
  const nextIssue = months.find((m) => m.future);
  const futureTotal = months.filter((m) => m.future).reduce((s, m) => s + m.total, 0);
  const best = months.reduce(
    (top, m) => (m.total > top.total ? m : top),
    { label: "—", total: 0, month: "", count: 0, future: false }
  );

  const recentSales = campaigns
    .filter((c) => c.saleDate && Number(c.value ?? 0) > 0)
    .sort((a, b) => b.saleDate!.getTime() - a.saleDate!.getTime())
    .slice(0, 10);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sales</h1>
        <p className="text-sm text-muted-foreground">
          Revenue by issue — including issues still to come. Purple bars are the future.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-primary/30 bg-primary/10 p-5">
          <div className="text-xs uppercase tracking-widest text-primary/80">Lifetime sales</div>
          <div className="mt-1 text-3xl font-bold text-primary">{gbp.format(lifetime)}</div>
          <div className="mt-1 text-xs text-muted-foreground">{campaigns.length} bookings</div>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            {thisYear} issues
          </div>
          <div className="mt-1 text-3xl font-bold">{gbp.format(ytd)}</div>
          <div className="mt-1 text-xs text-muted-foreground">whole year, booked so far</div>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            {currentIssue ? `This issue (${currentIssue.label})` : "This issue"}
          </div>
          <div className="mt-1 text-3xl font-bold">{gbp.format(currentIssue?.total ?? 0)}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {currentIssue?.count ?? 0} bookings
          </div>
        </div>
        <div className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-5">
          <div className="text-xs uppercase tracking-widest text-violet-300">
            Future issues
          </div>
          <div className="mt-1 text-3xl font-bold text-violet-300">{gbp.format(futureTotal)}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {nextIssue ? `next: ${nextIssue.label} at ${gbp.format(nextIssue.total)}` : "none booked yet"}
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Revenue by issue — last 12 + upcoming</CardTitle>
        </CardHeader>
        <CardContent>
          <SalesChart data={chartData} />
          <p className="mt-2 text-xs text-muted-foreground">
            Best issue ever: {best.label} at {gbp.format(best.total)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recently sold</CardTitle>
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
