import { db } from "@/lib/db";
import Link from "next/link";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SalesChart, type MonthlySales } from "@/components/sales/sales-chart";
import { notFound } from "next/navigation";
import { getMagazine } from "@/lib/magazines";
import { targetForMonth } from "@/lib/targets";

export const dynamic = "force-dynamic";

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

export default async function SalesPage({
  params,
  searchParams,
}: {
  params: Promise<{ magazine: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { magazine } = await params;
  const mag = getMagazine(magazine);
  if (!mag) notFound();
  // "issue" (default) = revenue lands on the issue the booking runs in;
  // "monthly" = revenue lands on the calendar month the sale was made.
  const monthly = (await searchParams).view === "monthly";

  const campaigns = await db.campaign.findMany({
    where: { magazineId: mag.slug, startDate: { not: null } },
    select: {
      startDate: true, saleDate: true, value: true, brand: true, package: true, issue: true,
    },
  });

  const now = new Date();
  const thisMonthKey = format(now, "yyyy-MM");
  const thisYear = String(now.getFullYear());

  const buildSeries = (rows: typeof campaigns, dateOf: (c: (typeof campaigns)[number]) => Date) => {
    const byMonth = new Map<string, { total: number; count: number }>();
    for (const c of rows) {
      const key = format(dateOf(c), "yyyy-MM");
      const entry = byMonth.get(key) ?? { total: 0, count: 0 };
      entry.total += Number(c.value ?? 0);
      entry.count += 1;
      byMonth.set(key, entry);
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]): MonthlySales => ({
        month,
        label: format(new Date(`${month}-01`), "MMM yy"),
        total: Math.round(v.total),
        count: v.count,
        future: month > thisMonthKey,
        target: null,
      }));
  };

  // Stat tiles always speak in issues, whichever chart view is showing
  const months = buildSeries(campaigns, (c) => c.startDate!).map((m) => ({
    ...m,
    target: targetForMonth(m.month, { magazine: mag.slug }),
  }));
  // Chart: last 12 months + (on issue view) everything booked ahead
  const chartMonths = monthly
    ? buildSeries(campaigns.filter((c) => c.saleDate), (c) => c.saleDate!)
    : months;
  const firstShown = Math.max(0, chartMonths.filter((m) => !m.future).length - 12);
  const chartData = chartMonths.slice(firstShown);

  // Year tiles sum raw values (not per-month rounded ones) so they match
  // FileMaker's own totals to the pound
  const yearTotal = (y: string) =>
    campaigns
      .filter((c) => format(c.startDate!, "yyyy") === y)
      .reduce((s, c) => s + Number(c.value ?? 0), 0);
  const ytd = yearTotal(thisYear);
  const lastYear = String(Number(thisYear) - 1);
  const lastYearTotal = yearTotal(lastYear);
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
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{mag.shortName} Sales</h1>
          <p className="text-sm text-muted-foreground">
            {monthly
              ? "Sales by calendar month — when the booking was made, whichever issue it runs in."
              : "Revenue by issue — including issues still to come. Purple bars are the future."}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/${mag.slug}/sales`}>
            <Badge variant={!monthly ? "default" : "outline"}>On Issue</Badge>
          </Link>
          <Link href={`/${mag.slug}/sales?view=monthly`}>
            <Badge variant={monthly ? "default" : "outline"}>Monthly Sales</Badge>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-primary/30 bg-primary/10 p-5">
          <div className="text-xs uppercase tracking-widest text-primary/80">
            {thisYear} sales
          </div>
          <div className="mt-1 text-3xl font-bold text-primary">{gbp.format(ytd)}</div>
          <div className="mt-1 text-xs text-muted-foreground">whole year, booked so far</div>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            {lastYear} sales
          </div>
          <div className="mt-1 text-3xl font-bold">{gbp.format(lastYearTotal)}</div>
          <div className="mt-1 text-xs text-muted-foreground">full year</div>
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
          <CardTitle>
            {monthly ? "Sales by month — last 12" : "Revenue by issue — last 12 + upcoming"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SalesChart
            data={chartData}
            revenueLabel={monthly ? "Sold this month" : "Issue revenue"}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Best issue ever: {best.label} at {gbp.format(best.total)}
            {monthly && " · Monthly view only counts bookings with a recorded sale date"}
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
