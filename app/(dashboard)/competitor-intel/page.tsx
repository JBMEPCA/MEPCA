import { db } from "@/lib/db";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  CompetitorSheetUpload, GoodTargetCheckbox, PitchedCheckbox, AddToPipelineButton,
} from "@/components/competitors/competitor-actions";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function CompetitorIntelPage({
  searchParams,
}: {
  searchParams: Promise<{ magazine?: string; q?: string; targets?: string }>;
}) {
  const { magazine, q, targets } = await searchParams;

  const where: Prisma.CompetitorAdvertiserWhereInput = {};
  if (magazine) where.competitorMagazine = magazine;
  if (q) where.brand = { contains: q, mode: "insensitive" };
  if (targets === "1") where.goodTarget = true;

  const [advertisers, magazines, total] = await Promise.all([
    db.competitorAdvertiser.findMany({ where, orderBy: { brand: "asc" }, take: 500 }),
    db.competitorAdvertiser.groupBy({
      by: ["competitorMagazine"],
      _count: true,
      orderBy: { _count: { competitorMagazine: "desc" } },
    }),
    db.competitorAdvertiser.count(),
  ]);

  const filterLink = (params: Record<string, string | undefined>) => {
    const merged = { magazine, q, targets, ...params };
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
          <p className="text-sm text-neutral-500">
            {total} advertisers logged from competitor titles
          </p>
        </div>
        <CompetitorSheetUpload />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={filterLink({ targets: targets === "1" ? undefined : "1" })}>
          <Badge variant={targets === "1" ? "default" : "outline"}>Good targets only</Badge>
        </Link>
        <span className="mx-1 text-neutral-300">|</span>
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
              <TableCell colSpan={7} className="py-10 text-center text-neutral-500">
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
        <p className="text-sm text-neutral-400">
          Showing first 500 — use the filters or search to narrow down.
        </p>
      )}
    </div>
  );
}
