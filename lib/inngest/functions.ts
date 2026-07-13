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

export const functions = [refreshCampaignStatuses];
