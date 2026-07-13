// Shows the test source's scan status and any advertisers it found
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const source = await db.watchedSource.findFirst({
  where: { url: "https://www.themanufacturer.com" },
});
console.log("Last checked:", source.lastCheckedAt);
console.log("Last result:", source.lastResult);

const found = await db.competitorAdvertiser.findMany({
  where: { source: "www.themanufacturer.com" },
  orderBy: { lastImportedAt: "desc" },
});
console.log(`\nAdvertisers from watcher (${found.length}):`);
for (const a of found) {
  console.log(`- ${a.brand} | ${a.adType ?? ""} | ${a.confidenceNotes ?? ""}`);
}
await db.$disconnect();
