import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const rows = await db.campaign.groupBy({
  by: ["issue"],
  _sum: { value: true },
  _count: true,
  where: { issue: { in: ["Jul 2026", "Aug 2026", "Sep 2026", "Oct 2026", "Nov 2026", "Dec 2026"] } },
});
for (const r of rows.sort((a, b) => a.issue.localeCompare(b.issue))) {
  console.log(`${r.issue}: £${Number(r._sum.value ?? 0).toLocaleString()} (${r._count} bookings)`);
}
await db.$disconnect();
