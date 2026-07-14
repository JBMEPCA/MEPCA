import { db } from "@/lib/db";
import Link from "next/link";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  CompetitorSheetUpload, GoodTargetCheckbox, PitchedCheckbox, AddToPipelineButton,
} from "@/components/competitors/competitor-actions";
import {
  SourceFormDialog, CheckNowButton, ActiveCheckbox, DeleteSourceButton,
  DismissAlertButton,
} from "@/components/sources/source-actions";
import { TYPE_OPTIONS } from "@/lib/source-types";
import { AgentHQ } from "@/components/agent-hq/agent-hq";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function CompetitorIntelPage({
  searchParams,
}: {
  searchParams: Promise<{ magazine?: string; q?: string; targets?: string; fresh?: string }>;
}) {
  const { magazine, q, targets, fresh } = await searchParams;

  const where: Prisma.CompetitorAdvertiserWhereInput = {};
  if (magazine) where.competitorMagazine = magazine;
  if (q) where.brand = { contains: q, mode: "insensitive" };
  if (targets === "1") where.goodTarget = true;
  if (fresh === "1") {
    where.firstSeenAt = { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
  }

  const [advertisers, magazines, total, watchedSources, alerts] = await Promise.all([
    db.competitorAdvertiser.findMany({ where, orderBy: { brand: "asc" }, take: 500 }),
    db.competitorAdvertiser.groupBy({
      by: ["competitorMagazine"],
      _count: true,
      orderBy: { _count: { competitorMagazine: "desc" } },
    }),
    db.competitorAdvertiser.count(),
    db.watchedSource.findMany({ orderBy: { name: "asc" } }),
    db.sourceAlert.findMany({
      where: { dismissed: false },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const filterLink = (params: Record<string, string | undefined>) => {
    const merged = { magazine, q, targets, fresh, ...params };
    const qs = Object.entries(merged)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
      .join("&");
    return qs ? `/competitor-intel?${qs}` : "/competitor-intel";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Competitor Intel</h1>
          <p className="text-sm text-muted-foreground">
            Agent Intel patrols {watchedSources.filter((s) => s.active).length} competitor
            sources every Monday at 06:00 — drag him onto a title to send him now.
            {" "}{total} advertisers logged so far.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <CompetitorSheetUpload />
          <SourceFormDialog trigger={<Button variant="outline">Watch new source</Button>} />
        </div>
      </div>

      <AgentHQ
        initialSources={watchedSources.map((s) => ({
          id: s.id,
          name: s.name,
          type: s.type,
          url: s.url,
          active: s.active,
          scanStatus: s.scanStatus,
          lastCheckedAt: s.lastCheckedAt?.toISOString() ?? null,
          lastResult: s.lastResult,
        }))}
      />

      {alerts.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/10">
          <CardHeader>
            <CardTitle className="text-amber-300">Agent Intel needs you</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {alerts.map((alert) => (
                <li key={alert.id} className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    {alert.message}
                    {alert.url && (
                      <>
                        {" "}
                        <a href={alert.url} target="_blank" rel="noreferrer"
                          className="text-primary underline">
                          open link
                        </a>
                      </>
                    )}
                    <span className="ml-2 text-muted-foreground">
                      {format(alert.createdAt, "d MMM")}
                    </span>
                  </span>
                  <DismissAlertButton id={alert.id} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Link href={filterLink({ targets: targets === "1" ? undefined : "1" })}>
          <Badge variant={targets === "1" ? "default" : "outline"}>Good targets only</Badge>
        </Link>
        <Link href={filterLink({ fresh: fresh === "1" ? undefined : "1" })}>
          <Badge variant={fresh === "1" ? "default" : "outline"}>New this week</Badge>
        </Link>
        <span className="mx-1 text-muted-foreground">|</span>
        <Link href={filterLink({ magazine: undefined })}>
          <Badge variant={!magazine ? "default" : "outline"}>All titles</Badge>
        </Link>
        {magazines.map((m) => (
          <Link key={m.competitorMagazine} href={filterLink({ magazine: m.competitorMagazine })}>
            <Badge variant={magazine === m.competitorMagazine ? "default" : "outline"}>
              {m.competitorMagazine} ({m._count})
            </Badge>
          </Link>
        ))}
      </div>

      <form action="/competitor-intel" className="flex gap-2">
        {magazine && <input type="hidden" name="magazine" value={magazine} />}
        {targets && <input type="hidden" name="targets" value={targets} />}
        {fresh && <input type="hidden" name="fresh" value={fresh} />}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search brands…"
          className="h-9 w-64 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
        />
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Brand</TableHead>
            <TableHead>Seen in</TableHead>
            <TableHead>Ad type</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead className="text-center">Good target</TableHead>
            <TableHead className="text-center">Pitched</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {advertisers.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                {total === 0
                  ? "No data yet — click Sync spreadsheet and upload MEPCA_Competitor_Advertisers_Pilot.xlsx."
                  : "Nothing matches the current filters."}
              </TableCell>
            </TableRow>
          )}
          {advertisers.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="font-medium">{a.brand}</TableCell>
              <TableCell>{a.competitorMagazine}</TableCell>
              <TableCell className="max-w-48 truncate" title={a.adType ?? ""}>
                {a.adType ?? "—"}
              </TableCell>
              <TableCell className="max-w-64 truncate" title={a.confidenceNotes ?? ""}>
                {a.confidenceNotes ?? "—"}
              </TableCell>
              <TableCell className="text-center">
                <GoodTargetCheckbox id={a.id} checked={a.goodTarget} />
              </TableCell>
              <TableCell className="text-center">
                <PitchedCheckbox id={a.id} checked={a.pitched} />
              </TableCell>
              <TableCell className="text-right">
                {!a.pitched && <AddToPipelineButton id={a.id} brand={a.brand} />}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {advertisers.length === 500 && (
        <p className="text-sm text-muted-foreground">
          Showing first 500 — use the filters or search to narrow down.
        </p>
      )}

      <details>
        <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
          Manage watched sources ({watchedSources.length})
        </summary>
        <div className="pt-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Watching</TableHead>
                <TableHead>Last checked</TableHead>
                <TableHead>Last result</TableHead>
                <TableHead className="text-center">Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {watchedSources.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">
                    <a href={s.url} target="_blank" rel="noreferrer" className="hover:underline">
                      {s.name}
                    </a>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {TYPE_OPTIONS.find((t) => t.value === s.type)?.label ?? s.type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {s.lastCheckedAt ? format(s.lastCheckedAt, "d MMM HH:mm") : "Never"}
                  </TableCell>
                  <TableCell className="max-w-72 truncate" title={s.lastResult ?? ""}>
                    {s.lastResult ?? "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    <ActiveCheckbox id={s.id} checked={s.active} />
                  </TableCell>
                  <TableCell className="space-x-1 text-right">
                    <CheckNowButton id={s.id} />
                    <SourceFormDialog
                      source={{ id: s.id, name: s.name, type: s.type, url: s.url }}
                      trigger={<Button variant="ghost" size="sm">Edit</Button>}
                    />
                    <DeleteSourceButton id={s.id} name={s.name} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </details>
    </div>
  );
}
