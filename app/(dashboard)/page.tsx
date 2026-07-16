import { db } from "@/lib/db";
import Link from "next/link";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { MAGAZINES } from "@/lib/magazines";

export const dynamic = "force-dynamic";

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

// Company-level landing page: one card per magazine with its vital signs,
// plus the combined year so far. Everything links down into the magazine.
export default async function CogentOverviewPage() {
  const yearStart = new Date(new Date().getFullYear(), 0, 1);

  const [activeCampaigns, openPipeline, ytdByMagazine] = await Promise.all([
    db.campaign.groupBy({
      by: ["magazineId"],
      where: { status: { in: ["LIVE", "UPCOMING"] } },
      _count: true,
    }),
    db.pipelineItem.groupBy({
      by: ["magazineId"],
      where: { stage: { notIn: ["SIGNED_OFF", "LOST"] } },
      _count: true,
    }),
    db.campaign.groupBy({
      by: ["magazineId"],
      where: { startDate: { gte: yearStart } },
      _sum: { value: true },
      _count: true,
    }),
  ]);

  const countFor = (rows: { magazineId: string; _count: number }[], slug: string) =>
    rows.find((r) => r.magazineId === slug)?._count ?? 0;
  const ytdFor = (slug: string) =>
    Number(ytdByMagazine.find((r) => r.magazineId === slug)?._sum.value ?? 0);

  const totalYtd = MAGAZINES.reduce((s, m) => s + ytdFor(m.slug), 0);
  const year = format(new Date(), "yyyy");

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cogent Multimedia</h1>
          <p className="text-sm text-muted-foreground">
            All five titles at a glance — pick a magazine to dive in.
          </p>
        </div>
        <Link
          href="/cogent-sales"
          className="rounded-md border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
        >
          Cogent Sales →
        </Link>
      </div>

      <div className="rounded-2xl border border-primary/30 bg-primary/10 p-5">
        <div className="text-xs uppercase tracking-widest text-primary/80">
          {year} revenue — all magazines
        </div>
        <div className="mt-1 text-3xl font-bold text-primary">{gbp.format(totalYtd)}</div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {MAGAZINES.map((m) => (
          <Link key={m.slug} href={`/${m.slug}`}>
            <Card className="h-full transition-colors hover:border-primary/50">
              <CardContent className="pt-6">
                <div
                  className="text-lg font-bold tracking-tight"
                  style={{ color: m.brandColor }}
                >
                  {m.name}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {m.siteUrl.replace(/^https?:\/\//, "")}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-xl font-bold">
                      {countFor(activeCampaigns, m.slug)}
                    </div>
                    <div className="text-[11px] text-muted-foreground">active campaigns</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold">{countFor(openPipeline, m.slug)}</div>
                    <div className="text-[11px] text-muted-foreground">open pitches</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-primary">
                      {gbp.format(ytdFor(m.slug))}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{year} revenue</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
