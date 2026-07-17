import { db } from "@/lib/db";
import Link from "next/link";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { SniperHQ } from "@/components/ads-leads/sniper-hq";
import {
  TermFormDialog, SeedFromCategoriesButton, SearchNowButton, ActiveTermCheckbox,
  DeleteTermButton, LeadGoodTargetCheckbox, LeadPitchedCheckbox, AddLeadToPipelineButton,
} from "@/components/ads-leads/ads-lead-actions";
import type { Prisma } from "@prisma/client";
import { notFound } from "next/navigation";
import { getMagazine } from "@/lib/magazines";

export const dynamic = "force-dynamic";

export default async function GoogleAdsLeadsPage({
  params,
  searchParams,
}: {
  params: Promise<{ magazine: string }>;
  searchParams: Promise<{ term?: string; q?: string; targets?: string; fresh?: string }>;
}) {
  const { magazine } = await params;
  const mag = getMagazine(magazine);
  if (!mag) notFound();
  const { term, q, targets, fresh } = await searchParams;

  const where: Prisma.GoogleAdsLeadWhereInput = { magazineId: mag.slug };
  if (term) where.searchTerm = term;
  if (q) where.company = { contains: q, mode: "insensitive" };
  if (targets === "1") where.goodTarget = true;
  if (fresh === "1") {
    where.firstSeenAt = { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
  }

  const [leads, byTerm, total, monitoredTerms, recent] = await Promise.all([
    db.googleAdsLead.findMany({ where, orderBy: { lastSeenAt: "desc" }, take: 500 }),
    db.googleAdsLead.groupBy({
      by: ["searchTerm"],
      where: { magazineId: mag.slug },
      _count: true,
      orderBy: { _count: { searchTerm: "desc" } },
    }),
    db.googleAdsLead.count({ where: { magazineId: mag.slug } }),
    db.monitoredTerm.findMany({ where: { magazineId: mag.slug }, orderBy: { term: "asc" } }),
    db.googleAdsLead.findMany({
      where: { magazineId: mag.slug },
      orderBy: { lastSeenAt: "desc" },
      take: 12,
      select: { company: true, searchTerm: true },
    }),
  ]);

  const activeCount = monitoredTerms.filter((t) => t.active).length;
  const basePath = `/${mag.slug}/google-ads-leads`;
  const filterLink = (patch: Record<string, string | undefined>) => {
    const merged = { term, q, targets, fresh, ...patch };
    const qs = Object.entries(merged)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
      .join("&");
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{mag.shortName} — Google Ads Leads</h1>
          <p className="text-sm text-muted-foreground">
            The Sniper googles {activeCount} term{activeCount === 1 ? "" : "s"} (UK-targeted) every
            Monday at 06:30, picking off every company running Google Ads on them — drag him onto a
            term to fire now. {total} lead{total === 1 ? "" : "s"} bagged so far.
          </p>
        </div>
        <TermFormDialog magazine={mag.slug} trigger={<Button variant="outline">Add term</Button>} />
      </div>

      <SniperHQ
        magazine={mag.slug}
        initialTerms={monitoredTerms.map((t) => ({
          id: t.id,
          term: t.term,
          category: t.category,
          active: t.active,
          searchStatus: t.searchStatus,
          lastCheckedAt: t.lastCheckedAt?.toISOString() ?? null,
          lastResult: t.lastResult,
        }))}
        recentLeads={recent.map((r) => ({ company: r.company, term: r.searchTerm }))}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Link href={filterLink({ targets: targets === "1" ? undefined : "1" })}>
          <Badge variant={targets === "1" ? "default" : "outline"}>Good targets only</Badge>
        </Link>
        <Link href={filterLink({ fresh: fresh === "1" ? undefined : "1" })}>
          <Badge variant={fresh === "1" ? "default" : "outline"}>New this week</Badge>
        </Link>
        <span className="mx-1 text-muted-foreground">|</span>
        <Link href={filterLink({ term: undefined })}>
          <Badge variant={!term ? "default" : "outline"}>All terms</Badge>
        </Link>
        {byTerm.map((t) => (
          <Link key={t.searchTerm} href={filterLink({ term: t.searchTerm })}>
            <Badge variant={term === t.searchTerm ? "default" : "outline"}>
              {t.searchTerm} ({t._count})
            </Badge>
          </Link>
        ))}
      </div>

      <form action={basePath} className="flex gap-2">
        {term && <input type="hidden" name="term" value={term} />}
        {targets && <input type="hidden" name="targets" value={targets} />}
        {fresh && <input type="hidden" name="fresh" value={fresh} />}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search companies…"
          className="h-9 w-64 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
        />
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Company</TableHead>
            <TableHead>Advertising on</TableHead>
            <TableHead>Website</TableHead>
            <TableHead>Ad copy</TableHead>
            <TableHead className="text-center">Good target</TableHead>
            <TableHead className="text-center">Pitched</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                {total === 0
                  ? "No leads yet — add a term (or seed them below) and send the Sniper in."
                  : "Nothing matches the current filters."}
              </TableCell>
            </TableRow>
          )}
          {leads.map((lead) => (
            <TableRow key={lead.id}>
              <TableCell className="font-medium">{lead.company}</TableCell>
              <TableCell>{lead.searchTerm}</TableCell>
              <TableCell className="max-w-48 truncate">
                {lead.website ? (
                  <a
                    href={/^https?:\/\//i.test(lead.website) ? lead.website : `https://${lead.website}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    {lead.website}
                  </a>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="max-w-64 truncate" title={lead.adHeadline ?? ""}>
                {lead.adHeadline ?? "—"}
              </TableCell>
              <TableCell className="text-center">
                <LeadGoodTargetCheckbox id={lead.id} checked={lead.goodTarget} />
              </TableCell>
              <TableCell className="text-center">
                <LeadPitchedCheckbox id={lead.id} checked={lead.pitched} />
              </TableCell>
              <TableCell className="text-right">
                {!lead.pitched && <AddLeadToPipelineButton id={lead.id} company={lead.company} />}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {leads.length === 500 && (
        <p className="text-sm text-muted-foreground">
          Showing first 500 — use the filters or search to narrow down.
        </p>
      )}

      <details>
        <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
          Manage monitored terms ({monitoredTerms.length})
        </summary>
        <div className="space-y-3 pt-3">
          {mag.slug === "mepca" && <SeedFromCategoriesButton magazine={mag.slug} />}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Term</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Last swept</TableHead>
                <TableHead>Last result</TableHead>
                <TableHead className="text-center">Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monitoredTerms.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                    No terms yet. Add one above{mag.slug === "mepca" ? ", or seed them from your WordPress categories" : ""}.
                  </TableCell>
                </TableRow>
              )}
              {monitoredTerms.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.term}</TableCell>
                  <TableCell>{t.category ?? "—"}</TableCell>
                  <TableCell>
                    {t.lastCheckedAt ? format(t.lastCheckedAt, "d MMM HH:mm") : "Never"}
                  </TableCell>
                  <TableCell className="max-w-72 truncate" title={t.lastResult ?? ""}>
                    {t.lastResult ?? "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    <ActiveTermCheckbox id={t.id} checked={t.active} />
                  </TableCell>
                  <TableCell className="space-x-1 text-right">
                    <SearchNowButton id={t.id} />
                    <TermFormDialog
                      magazine={mag.slug}
                      term={{ id: t.id, term: t.term, category: t.category }}
                      trigger={<Button variant="ghost" size="sm">Edit</Button>}
                    />
                    <DeleteTermButton id={t.id} term={t.term} />
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
