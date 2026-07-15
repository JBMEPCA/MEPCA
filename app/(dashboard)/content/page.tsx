import { db } from "@/lib/db";
import { format, isToday, isTomorrow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReceivedCheckbox } from "@/components/content/received-checkbox";
import { listUpcomingEshots } from "@/lib/google";

export const dynamic = "force-dynamic";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

const ESHOT_RE = /e-?shot|newsletter/i;
const BANNER_RE = /banner|takeover|homescreen|mpu|leaderboard|website exclusive/i;

// "February 2026" -> "Feb 2026", matching campaign.issue
const shortIssue = (issue: string) => {
  const [month, year] = issue.split(" ");
  return `${month.slice(0, 3)} ${year}`;
};

export default async function ContentPage() {
  const now = new Date();

  const [deadlines, liveBanners, eshotSchedule] = await Promise.all([
    db.issueDeadline.findMany({
      where: { adsDeadline: { gte: new Date(now.getTime() - 3 * 86400000) } },
      orderBy: { adsDeadline: "asc" },
      take: 3,
    }),
    db.campaign.findMany({
      where: {
        startDate: { lte: now },
        endDate: { gte: now },
      },
      orderBy: { endDate: "asc" },
    }),
    listUpcomingEshots(42),
  ]);

  const issueGroups = await Promise.all(
    deadlines.map(async (d) => {
      const bookings = await db.campaign.findMany({
        where: { issue: shortIssue(d.issue) },
        orderBy: [{ contentReceived: "asc" }, { brand: "asc" }],
      });
      return { deadline: d, bookings };
    })
  );

  const banners = liveBanners.filter((c) => BANNER_RE.test(c.package));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Upcoming Content</h1>
        <p className="text-sm text-muted-foreground">
          Everything due in the next issues — tick each item off as the content arrives.
        </p>
      </div>

      {issueGroups.map(({ deadline, bookings }) => {
        const days = Math.ceil((deadline.adsDeadline!.getTime() - now.getTime()) / 86400000);
        const ads = bookings.filter((b) => !ESHOT_RE.test(b.package));
        const eshots = bookings.filter((b) => ESHOT_RE.test(b.package));
        const received = bookings.filter((b) => b.contentReceived).length;
        return (
          <Card key={deadline.id} className={days <= 7 ? "border-amber-500/40" : ""}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>
                  {deadline.issue} issue
                  <span className="ml-3 text-sm font-normal text-muted-foreground">
                    100% ads due {format(deadline.adsDeadline!, "EEE d MMM")}
                    {deadline.printDate && ` · print ${format(deadline.printDate, "d MMM")}`}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-sm font-normal text-muted-foreground">
                    {received}/{bookings.length} received
                  </span>
                  <Badge variant={days <= 7 ? "destructive" : "outline"}>
                    {days <= 0 ? "due now" : `${days} days`}
                  </Badge>
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <ContentChecklist title={`Print & edit (${ads.length})`} items={ads} />
              {eshots.length > 0 && (
                <ContentChecklist title={`E-shots & newsletters (${eshots.length})`} items={eshots} />
              )}
              {bookings.length === 0 && (
                <p className="text-sm text-muted-foreground">Nothing booked for this issue yet.</p>
              )}
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardHeader>
          <CardTitle>Banners that should be live now ({banners.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {banners.length === 0 ? (
            <p className="text-sm text-muted-foreground">No banner campaigns currently running.</p>
          ) : (
            <ul className="divide-y divide-border">
              {banners.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="flex items-center gap-3">
                    <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-400" />
                    <span className="font-medium">{c.brand}</span>
                    <span className="text-muted-foreground">— {c.package}</span>
                  </span>
                  <span className="flex items-center gap-4">
                    <span className="text-muted-foreground">
                      until {c.endDate ? format(c.endDate, "d MMM yyyy") : "—"}
                    </span>
                    <span className="font-semibold text-primary">
                      {c.value != null ? gbp.format(Number(c.value)) : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            E-shot send schedule
            <span className="ml-3 text-sm font-normal text-muted-foreground">
              next 6 weeks, live from Google Calendar
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {eshotSchedule === null ? (
            <p className="text-sm text-muted-foreground">
              Couldn&apos;t reach the calendar — check the Google credentials are set.
            </p>
          ) : eshotSchedule.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing scheduled in the next 6 weeks.</p>
          ) : (
            <ul className="divide-y divide-border">
              {eshotSchedule.map((e, i) => {
                const days = Math.ceil((e.date.getTime() - now.getTime()) / 86400000);
                const when = isToday(e.date)
                  ? "today"
                  : isTomorrow(e.date)
                    ? "tomorrow"
                    : format(e.date, "EEE d MMM");
                return (
                  <li key={i} className="flex items-center justify-between py-2 text-sm">
                    <span className="flex items-center gap-3">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${
                          days <= 2 ? "animate-pulse bg-amber-400" : "bg-cyan-500/60"
                        }`}
                      />
                      <span className="font-medium">{e.title}</span>
                    </span>
                    <span className={days <= 2 ? "font-medium text-amber-300" : "text-muted-foreground"}>
                      {when}
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

function ContentChecklist({
  title,
  items,
}: {
  title: string;
  items: {
    id: string; brand: string; package: string; value: unknown;
    contentReceived: boolean;
  }[];
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </h3>
      <ul className="divide-y divide-border">
        {items.map((c) => (
          <li key={c.id} className="flex items-center justify-between py-2 text-sm">
            <span className="flex items-center gap-3">
              <ReceivedCheckbox id={c.id} checked={c.contentReceived} />
              <span className={c.contentReceived ? "text-muted-foreground line-through" : "font-medium"}>
                {c.brand}
              </span>
              <span className="text-muted-foreground">— {c.package}</span>
            </span>
            <span className="text-muted-foreground">
              {c.value != null && Number(c.value) > 0 ? gbp.format(Number(c.value)) : "edit"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
