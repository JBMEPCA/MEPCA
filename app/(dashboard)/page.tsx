import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const now = new Date();
  const soon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const [liveCount, upcomingCount, pipelineCount, dueFollowUps, endingSoon, targetCount, nextDeadlines] =
    await Promise.all([
      db.campaign.count({ where: { status: "LIVE" } }),
      db.campaign.count({ where: { status: "UPCOMING" } }),
      db.pipelineItem.count({ where: { stage: { notIn: ["SIGNED_OFF", "LOST"] } } }),
      db.pipelineItem.findMany({
        where: { followUpDate: { lte: now }, stage: { notIn: ["SIGNED_OFF", "LOST"] } },
        orderBy: { followUpDate: "asc" },
        take: 8,
      }),
      db.campaign.findMany({
        where: { status: "LIVE", endDate: { gte: now, lte: soon } },
        orderBy: { endDate: "asc" },
        take: 8,
      }),
      db.competitorAdvertiser.count({ where: { goodTarget: true, pitched: false } }),
      db.issueDeadline.findMany({
        where: { adsDeadline: { gte: now } },
        orderBy: { adsDeadline: "asc" },
        take: 3,
      }),
    ]);

  // "February 2026" -> "Feb 2026" so deadline issues match campaign issues
  const shortIssue = (issue: string) => {
    const [month, year] = issue.split(" ");
    return `${month.slice(0, 3)} ${year}`;
  };
  const chaseCounts = await Promise.all(
    nextDeadlines.map((d) =>
      db.campaign.count({ where: { issue: shortIssue(d.issue), value: { gt: 0 } } })
    )
  );

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold tracking-tight">Overview</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Live campaigns" value={liveCount} href="/campaigns" />
        <StatCard label="Upcoming campaigns" value={upcomingCount} href="/campaigns" />
        <StatCard label="Open pipeline pitches" value={pipelineCount} href="/pipeline" />
        <StatCard label="Unpitched good targets" value={targetCount} href="/competitor-intel" />
      </div>

      {nextDeadlines.length > 0 && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle>Ad content deadlines — chase list</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {nextDeadlines.map((d, i) => {
                const days = Math.ceil(
                  (d.adsDeadline!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
                );
                return (
                  <li key={d.id} className="flex items-center justify-between text-sm">
                    <span>
                      <span className="font-medium">{d.issue} issue</span>{" "}
                      <span className="text-muted-foreground">
                        — 100% ads due {format(d.adsDeadline!, "EEE d MMM")}
                        {chaseCounts[i] > 0 && ` · ${chaseCounts[i]} campaign${chaseCounts[i] > 1 ? "s" : ""} booked to chase`}
                      </span>
                    </span>
                    <Badge
                      variant={days <= 7 ? "destructive" : "outline"}
                      className={days <= 7 ? "" : "text-primary"}
                    >
                      {days === 0 ? "today" : `${days} day${days > 1 ? "s" : ""}`}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Follow-ups due</CardTitle>
          </CardHeader>
          <CardContent>
            {dueFollowUps.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing due — you&apos;re on top of it.</p>
            ) : (
              <ul className="space-y-2">
                {dueFollowUps.map((item) => (
                  <li key={item.id} className="flex items-center justify-between text-sm">
                    <span className="font-medium">{item.brand}</span>
                    <Badge variant="destructive">
                      {item.followUpDate ? format(item.followUpDate, "d MMM") : ""}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Campaigns ending in the next 14 days</CardTitle>
          </CardHeader>
          <CardContent>
            {endingSoon.length === 0 ? (
              <p className="text-sm text-muted-foreground">No campaigns ending soon.</p>
            ) : (
              <ul className="space-y-2">
                {endingSoon.map((c) => (
                  <li key={c.id} className="flex items-center justify-between text-sm">
                    <span className="font-medium">{c.brand}</span>
                    <span className="text-muted-foreground">
                      ends {c.endDate ? format(c.endDate, "d MMM") : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href}>
      <Card className="transition-colors hover:border-primary/50">
        <CardContent className="pt-6">
          <div className="text-3xl font-bold">{value}</div>
          <div className="text-sm text-muted-foreground">{label}</div>
        </CardContent>
      </Card>
    </Link>
  );
}
