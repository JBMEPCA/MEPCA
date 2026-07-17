"use server";

import { db } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";
import { revalidatePath } from "next/cache";

// Fires the background crawl; the Link Map tab polls the SiteCrawl row for
// progress. Ignores the click if a crawl is already underway (crawls stuck
// for over 2 hours are treated as dead — a redeploy can kill a run).
export async function requestLinkMapCrawl(magazineId: string) {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const active = await db.siteCrawl.findFirst({
    where: {
      magazineId,
      status: { in: ["QUEUED", "RUNNING"] },
      startedAt: { gte: twoHoursAgo },
    },
  });
  if (active) return;

  const crawl = await db.siteCrawl.create({ data: { magazineId } });
  await inngest.send({
    name: "linkmap/crawl.requested",
    data: { magazineId, crawlId: crawl.id },
  });
  revalidatePath(`/${magazineId}/linkmap`);
}
