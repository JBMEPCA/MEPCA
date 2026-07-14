// Lists distinct competitor magazines in intel vs. what's already watched
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const magazines = await db.competitorAdvertiser.groupBy({
  by: ["competitorMagazine"],
  _count: true,
  orderBy: { _count: { competitorMagazine: "desc" } },
});
const watched = new Set((await db.watchedSource.findMany()).map((s) => s.name));

for (const m of magazines) {
  const mark = watched.has(m.competitorMagazine) ? "WATCHED" : "MISSING";
  console.log(`${mark}\t${m._count}\t${m.competitorMagazine}`);
}
await db.$disconnect();
