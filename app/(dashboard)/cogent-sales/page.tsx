import { db } from "@/lib/db";
import Link from "next/link";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { SalesChart, type MonthlySales } from "@/components/sales/sales-chart";
import { MAGAZINES, getMagazine } from "@/lib/magazines";
import { targetForMonth } from "@/lib/targets";

export const dynamic = "force-dynamic";

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

// The Director's view: sales across every magazine, filterable down to one
// title or one sales person.
export default async function CogentSalesPage({
  searchParams,
}: {
  searchParams: Promise<{ mag?: string; person?: string }>;
}) {
  const { mag, person } = await searchParams;

  const campaigns = await db.campaign.findMany({
    where: {
      startDate: { not: null },
      ...(mag ? { magazineId: mag } : {}),
      ...(person ? { salesperson: person } : {}),
    },
    select: {
      magazineId: true, salesperson: true, startDate: true, saleDate: true,
      value: true, brand: true, package: true, issue: true,
    },
  });

  // Distinct salespeople across ALL campaigns (not just filtered), so the
  // filter row doesn't collapse when one person is selected.
  const peopleRows = await db.campaign.findMany({
    where: { salesperson: { not: null } },
    select: { salesperson: true },
    distinct: ["salesperson"],
    orderBy: { salesperson: "asc" },
  });
  const people = peopleRows.map((r) => r.salesperson!).filter(Boolean);

  // Monthly revenue attributed to the issue each booking runs in
  const byMonth = new Map<string, { total: number; count: number }>();
  let lifetime = 0;
  for (const c of campaigns) {
    const key = format(c.startDate!, "yyyy-MM");
    const entry = byMonth.get(key) ?? { total: 0, count: 0 };
    entry.total += Number(c.value ?? 0);
    entry.count += 1;
    byMonth.set(key, entry);
    lifetime += Number(c.value ?? 0);
  }

  const now = new Date();
  const thisMonthKey = format(now, "yyyy-MM");
  const thisYear = String(now.getFullYear());

  const months: MonthlySales[] = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      label: format(new Date(`${month}-01`), "MMM yy"),
      total: Math.round(v.total),
      count: v.count,
      future: month > thisMonthKey,
      // person filter → their personal target; magazine filter → that title's
      // target; no filter → whole-company target
      target: targetForMonth(month, { magazine: mag, person }),
    }));
  const firstShown = Math.max(0, months.filter((m) => !m.future).length - 12);
  const chartData = months.slice(firstShown);

  const ytd = months.filter((m) => m.month.startsWith(thisYear)).reduce((s, m) => s + m.total, 0);
  const thisIssue = months.find((m) => m.month === thisMonthKey);
  const futureTotal = months.filter((m) => m.future).reduce((s, m) => s + m.total, 0);

  // Per-magazine breakdown (respects the person filter via `campaigns`)
  const perMagazine = MAGAZINES.map((m) => {
    const own = campaigns.filter((c) => c.magazineId === m.slug);
    const own_ytd = own
      .filter((c) => format(c.startDate!, "yyyy").startsWith(thisYear))
      .reduce((s, c) => s + Number(c.value ?? 0), 0);
    return {
      mag: m,
      count: own.length,
      lifetime: own.reduce((s, c) => s + Number(c.value ?? 0), 0),
      ytd: own_ytd,
    };
  });

  // Per-salesperson breakdown (respects the magazine filter via `campaigns`)
  const perPerson = new Map<string, { count: number; lifetime: number; ytd: number }>();
  for (const c of campaigns) {
    const key = c.salesperson ?? "Unattributed";
    const entry = perPerson.get(key) ?? { count: 0, lifetime: 0, ytd: 0 };
    entry.count += 1;
    entry.lifetime += Number(c.value ?? 0);
    if (format(c.startDate!, "yyyy") === thisYear) entry.ytd += Number(c.value ?? 0);
    perPerson.set(key, entry);
  }
  const personRows = [...perPerson.entries()].sort((a, b) => b[1].ytd - a[1].ytd);

  const recentSales = campaigns
    .filter((c) => c.saleDate && Number(c.value ?? 0) > 0)
    .sort((a, b) => b.saleDate!.getTime() - a.saleDate!.getTime())
    .slice(0, 12);

  const filterLink = (params: { mag?: string; person?: string }) => {
    const merged = { mag, person, ...params };
    const qs = Object.entries(merged)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
      .join("&");
    return qs ? `/cogent-sales?${qs}` : "/cogent-sales";
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cogent Sales</h1>
        <p className="text-sm text-muted-foreground">
          Every magazine, every sales person — revenue attributed to the issue it runs in.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={filterLink({ mag: undefined })}>
          <Badge variant={!mag ? "default" : "outline"}>All magazines</Badge>
        </Link>
        {MAGAZINES.map((m) => (
          <Link key={m.slug} href={filterLink({ mag: mag === m.slug ? undefined : m.slug })}>
            <Badge
              variant={mag === m.slug ? "default" : "outline"}
              style={mag === m.slug ? {} : { color: m.brandColor, borderColor: `${m.brandColor}66` }}
            >
              {m.shortName}
            </Badge>
          </Link>
        ))}
        {people.length > 0 && <span className="mx-1 text-muted-foreground">|</span>}
        {people.length > 0 && (
          <Link href={filterLink({ person: undefined })}>
            <Badge variant={!person ? "default" : "outline"}>All people</Badge>
          </Link>
        )}
        {people.map((p) => (
          <Link key={p} href={filterLink({ person: person === p ? undefined : p })}>
            <Badge variant={person === p ? "default" : "outline"}>{p}</Badge>
          </Link>
        ))}
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
            {thisIssue ? `This issue (${thisIssue.label})` : "This issue"}
          </div>
          <div className="mt-1 text-3xl font-bold">{gbp.format(thisIssue?.total ?? 0)}</div>
          <div className="mt-1 text-xs text-muted-foreground">{thisIssue?.count ?? 0} bookings</div>
        </div>
        <div className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-5">
          <div className="text-xs uppercase tracking-widest text-violet-300">Future issues</div>
          <div className="mt-1 text-3xl font-bold text-violet-300">{gbp.format(futureTotal)}</div>
          <div className="mt-1 text-xs text-muted-foreground">booked ahead</div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Revenue by issue — last 12 + upcoming
            {mag && ` · ${getMagazine(mag)?.shortName ?? mag}`}
            {person && ` · ${person}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SalesChart data={chartData} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By magazine</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Magazine</TableHead>
                  <TableHead className="text-right">{thisYear}</TableHead>
                  <TableHead className="text-right">Lifetime</TableHead>
                  <TableHead className="text-right">Bookings</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perMagazine.map(({ mag: m, count, lifetime: life, ytd: y }) => (
                  <TableRow key={m.slug}>
                    <TableCell>
                      <Link
                        href={`/${m.slug}/sales`}
                        className="font-medium hover:underline"
                        style={{ color: m.brandColor }}
                      >
                        {m.shortName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right font-semibold">{gbp.format(y)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{gbp.format(life)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By sales person</CardTitle>
          </CardHeader>
          <CardContent>
            {personRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No sales-person data yet — it fills in from the FileMaker import&apos;s
                Sales Person column, or the Sales person box on each campaign.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sales person</TableHead>
                    <TableHead className="text-right">{thisYear}</TableHead>
                    <TableHead className="text-right">Lifetime</TableHead>
                    <TableHead className="text-right">Bookings</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {personRows.map(([name, v]) => (
                    <TableRow key={name}>
                      <TableCell className="font-medium">{name}</TableCell>
                      <TableCell className="text-right font-semibold">{gbp.format(v.ytd)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{gbp.format(v.lifetime)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{v.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recently sold</CardTitle>
        </CardHeader>
        <CardContent>
          {recentSales.length === 0 ? (
            <p className="text-sm text-muted-foreground">No dated sales match these filters.</p>
          ) : (
            <ul className="divide-y divide-border">
              {recentSales.map((c, i) => {
                const m = getMagazine(c.magazineId);
                return (
                  <li key={i} className="flex items-center justify-between py-2 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{c.brand}</span>{" "}
                      <span className="text-muted-foreground">
                        — {c.package}
                        {c.issue ? ` · ${c.issue} issue` : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-4">
                      {m && (
                        <span className="text-xs font-medium" style={{ color: m.brandColor }}>
                          {m.shortName}
                        </span>
                      )}
                      {c.salesperson && (
                        <span className="text-xs text-muted-foreground">{c.salesperson}</span>
                      )}
                      <span className="text-muted-foreground">
                        {c.saleDate ? format(c.saleDate, "d MMM yyyy") : ""}
                      </span>
                      <span className="min-w-16 text-right font-semibold text-primary">
                        {gbp.format(Number(c.value))}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
