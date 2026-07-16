import { db } from "@/lib/db";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CampaignFormDialog } from "@/components/campaigns/campaign-form-dialog";
import { DeleteCampaignButton } from "@/components/campaigns/delete-campaign-button";
import { FileMakerImportButton } from "@/components/campaigns/filemaker-import-button";
import { notFound } from "next/navigation";
import { getMagazine } from "@/lib/magazines";

export const dynamic = "force-dynamic";

const statusStyles: Record<string, { label: string; className: string }> = {
  LIVE: { label: "Live", className: "bg-green-500/15 text-green-400 hover:bg-green-500/15" },
  UPCOMING: { label: "Upcoming", className: "bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/15" },
  COMPLETED: { label: "Completed", className: "bg-white/10 text-muted-foreground hover:bg-white/10" },
};

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

export default async function CampaignsPage({
  params,
  searchParams,
}: {
  params: Promise<{ magazine: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { magazine } = await params;
  const mag = getMagazine(magazine);
  if (!mag) notFound();
  const { q } = await searchParams;

  const campaigns = await db.campaign.findMany({
    where: {
      magazineId: mag.slug,
      ...(q ? { brand: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: [{ startDate: "desc" }],
  });

  // Group into one expandable row per brand
  const brands = new Map<string, typeof campaigns>();
  for (const c of campaigns) {
    brands.set(c.brand, [...(brands.get(c.brand) ?? []), c]);
  }

  const brandSummaries = [...brands.entries()]
    .map(([brand, items]) => {
      const starts = items.map((i) => i.startDate).filter(Boolean) as Date[];
      const ends = items.map((i) => i.endDate).filter(Boolean) as Date[];
      const total = items.reduce((s, i) => s + Number(i.value ?? 0), 0);
      const hasLive = items.some((i) => i.status === "LIVE");
      const hasUpcoming = items.some((i) => i.status === "UPCOMING");
      return {
        brand,
        items,
        total,
        start: starts.length ? new Date(Math.min(...starts.map((d) => d.getTime()))) : null,
        end: ends.length ? new Date(Math.max(...ends.map((d) => d.getTime()))) : null,
        state: hasLive ? "LIVE" : hasUpcoming ? "UPCOMING" : "COMPLETED",
      };
    })
    .sort((a, b) => (b.end?.getTime() ?? 0) - (a.end?.getTime() ?? 0));

  const liveValue = campaigns
    .filter((c) => c.status !== "COMPLETED")
    .reduce((s, c) => s + Number(c.value ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{mag.shortName} Campaigns</h1>
          <p className="text-sm text-muted-foreground">
            {brandSummaries.length} brands · {campaigns.length} bookings ·{" "}
            <span className="text-primary">{gbp.format(liveValue)}</span>
            {" live & upcoming"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <FileMakerImportButton magazine={mag.slug} />
          <CampaignFormDialog magazine={mag.slug} trigger={<Button>New campaign</Button>} />
        </div>
      </div>

      <form action={`/${mag.slug}/campaigns`}>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search brands…"
          className="h-9 w-64 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
        />
      </form>

      <div className="space-y-2">
        {brandSummaries.length === 0 && (
          <p className="py-10 text-center text-muted-foreground">
            No campaigns{q ? ` matching “${q}”` : " yet"}.
          </p>
        )}
        {brandSummaries.map((b) => {
          const state = statusStyles[b.state];
          return (
            <details key={b.brand} className="group rounded-xl border bg-card">
              <summary className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="text-muted-foreground transition-transform group-open:rotate-90">▸</span>
                  <span className="truncate font-medium">{b.brand}</span>
                  <Badge className={state.className}>{state.label}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {b.items.length} booking{b.items.length > 1 ? "s" : ""}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-4 text-sm">
                  <span className="text-muted-foreground">
                    {b.start ? format(b.start, "MMM yy") : "—"} → {b.end ? format(b.end, "MMM yy") : "—"}
                  </span>
                  <span className="min-w-20 text-right font-semibold text-primary">
                    {gbp.format(b.total)}
                  </span>
                </span>
              </summary>
              <div className="border-t border-border px-2 pb-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Package / position</TableHead>
                      <TableHead>Issue</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Sold</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {b.items.map((c) => {
                      const s = statusStyles[c.status] ?? statusStyles.UPCOMING;
                      return (
                        <TableRow key={c.id}>
                          <TableCell>{c.package}</TableCell>
                          <TableCell>{c.issue ?? (c.startDate ? format(c.startDate, "MMM yyyy") : "—")}</TableCell>
                          <TableCell>{c.value != null ? gbp.format(Number(c.value)) : "—"}</TableCell>
                          <TableCell>
                            <Badge className={s.className}>{s.label}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {c.saleDate ? format(c.saleDate, "d MMM yy") : "—"}
                          </TableCell>
                          <TableCell className="space-x-1 text-right">
                            <CampaignFormDialog
                              magazine={mag.slug}
                              campaign={{
                                id: c.id,
                                brand: c.brand,
                                package: c.package,
                                value: c.value?.toString(),
                                startDate: c.startDate ? format(c.startDate, "yyyy-MM-dd") : undefined,
                                endDate: c.endDate ? format(c.endDate, "yyyy-MM-dd") : undefined,
                                status: c.status,
                                salesperson: c.salesperson ?? undefined,
                                notes: c.notes ?? undefined,
                              }}
                              trigger={<Button variant="ghost" size="sm">Edit</Button>}
                            />
                            <DeleteCampaignButton id={c.id} brand={c.brand} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
