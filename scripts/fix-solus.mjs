// Removes bookings whose brand wrongly absorbed the "Solus" position suffix;
// the follow-up re-import recreates them correctly split.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const bad = await db.campaign.findMany({ where: { brand: { endsWith: "Solus" } } });
for (const c of bad) console.log("removing:", c.brand, "|", c.package, "|", c.issue);
const r = await db.campaign.deleteMany({ where: { brand: { endsWith: "Solus" } } });
console.log(`deleted ${r.count}`);
await db.$disconnect();
