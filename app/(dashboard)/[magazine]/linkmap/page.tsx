import { notFound } from "next/navigation";
import { getMagazine } from "@/lib/magazines";
import { db } from "@/lib/db";
import { LinkMap, type CrawlInfo } from "@/components/linkmap/link-map";

export const metadata = { title: "Internal Link Map — Cogent Hub" };

export default async function LinkMapPage({
  params,
}: {
  params: Promise<{ magazine: string }>;
}) {
  const { magazine } = await params;
  const mag = getMagazine(magazine);
  if (!mag) notFound();

  const latest = await db.siteCrawl.findFirst({
    where: { magazineId: mag.slug },
    orderBy: { startedAt: "desc" },
  });
  // client component props must be serialisable — dates become strings
  const initialCrawl: CrawlInfo = latest
    ? {
        id: latest.id,
        status: latest.status,
        totalPages: latest.totalPages,
        crawledPages: latest.crawledPages,
        error: latest.error,
        finishedAt: latest.finishedAt?.toISOString() ?? null,
      }
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Internal Link Map</h1>
        <p className="text-sm text-muted-foreground">
          Every page on {mag.siteUrl.replace(/^https?:\/\//, "")} as a dot, every in-content link
          between two pages as a line. Drag to rotate, scroll to zoom, hover a dot to see the
          page, click it to open. Menu and footer links are ignored — only deliberate editorial
          links count, which is what matters for SEO.
        </p>
      </div>
      <LinkMap magazineId={mag.slug} brandColor={mag.brandColor} initialCrawl={initialCrawl} />
    </div>
  );
}
