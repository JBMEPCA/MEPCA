import { inngest } from "./client";
import { db } from "@/lib/db";

// Runs every morning at 7:30 UK time. For milestone 1 it keeps campaign
// statuses honest (upcoming -> live -> completed based on dates). Later
// milestones hang LinkedIn posting, SEO checks and email digests off the
// same pattern.
export const refreshCampaignStatuses = inngest.createFunction(
  {
    id: "refresh-campaign-statuses",
    triggers: [{ cron: "TZ=Europe/London 30 7 * * *" }],
  },
  async () => {
    const now = new Date();

    const toLive = await db.campaign.updateMany({
      where: {
        status: "UPCOMING",
        startDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
      },
      data: { status: "LIVE" },
    });

    const toCompleted = await db.campaign.updateMany({
      where: { status: { not: "COMPLETED" }, endDate: { lt: now } },
      data: { status: "COMPLETED" },
    });

    return { movedToLive: toLive.count, movedToCompleted: toCompleted.count };
  }
);

// Weekly competitor scan: every Monday 06:00 UK time, check every active
// source. Each source runs as its own step so one slow site can't sink the run.
export const scanCompetitorSources = inngest.createFunction(
  {
    id: "scan-competitor-sources",
    triggers: [{ cron: "TZ=Europe/London 0 6 * * 1" }],
  },
  async ({ step }) => {
    const { scanSource } = await import("@/lib/scanner");
    const sources = await step.run("load-sources", () =>
      db.watchedSource.findMany({ where: { active: true } })
    );

    const results: Record<string, string> = {};
    for (const source of sources) {
      results[source.name] = await step.run(`scan-${source.id}`, async () => {
        try {
          return await scanSource({
            ...source,
            createdAt: new Date(source.createdAt),
            updatedAt: new Date(source.updatedAt),
            lastCheckedAt: source.lastCheckedAt ? new Date(source.lastCheckedAt) : null,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Scan failed";
          await db.watchedSource.update({
            where: { id: source.id },
            data: { lastCheckedAt: new Date(), lastResult: `Error: ${msg}` },
          });
          return `Error: ${msg}`;
        }
      });
    }
    return results;
  }
);

// On-demand scan of a single source — fired by the "Check now" button
export const scanSourceOnDemand = inngest.createFunction(
  {
    id: "scan-source-on-demand",
    triggers: [{ event: "sources/scan.requested" }],
  },
  async ({ event, step }) => {
    const { scanSource } = await import("@/lib/scanner");
    return step.run("scan", async () => {
      const source = await db.watchedSource.findUniqueOrThrow({
        where: { id: event.data.sourceId as string },
      });
      try {
        return await scanSource(source);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Scan failed";
        await db.watchedSource.update({
          where: { id: source.id },
          data: { lastCheckedAt: new Date(), lastResult: `Error: ${msg}` },
        });
        return `Error: ${msg}`;
      }
    });
  }
);

export const functions = [refreshCampaignStatuses, scanCompetitorSources, scanSourceOnDemand];
