// Seeds the full competitor watch list (idempotent — skips URLs already present)
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const SOURCES = [
  // Websites — banner ad scanning
  { name: "The Manufacturer", type: "WEBSITE", url: "https://www.themanufacturer.com" },
  { name: "Warehouse & Logistics News", type: "WEBSITE", url: "https://warehousenews.co.uk" },
  { name: "Controls, Drives & Automation", type: "WEBSITE", url: "https://www.controlsdrivesautomation.com" },
  { name: "Drives & Controls", type: "WEBSITE", url: "https://drivesncontrols.com" },
  { name: "Automation", type: "WEBSITE", url: "https://www.automationmagazine.co.uk" },
  { name: "Design Solutions", type: "WEBSITE", url: "https://www.designsolutionsmag.co.uk" },
  { name: "Process & Control", type: "WEBSITE", url: "https://processandcontrolmag.co.uk" },
  { name: "FHS (Factory & Handling Solutions)", type: "WEBSITE", url: "https://www.factoryandhandlingsolutions.co.uk" },
  { name: "Instrumentation", type: "WEBSITE", url: "https://www.instrumentation.co.uk" },
  { name: "UK Manufacturing", type: "WEBSITE", url: "https://www.uk-manufacturing-online.co.uk" },
  // Digital edition archives — new-issue detection (Yudu flipbooks → alerts)
  { name: "Warehouse & Logistics News", type: "FLIPBOOK", url: "https://warehousenews.co.uk/digital-editions/" },
  { name: "Controls, Drives & Automation", type: "FLIPBOOK", url: "https://www.controlsdrivesautomation.com/digital-editions/" },
  { name: "Automation", type: "FLIPBOOK", url: "https://www.automationmagazine.co.uk/digital-editions/" },
  { name: "Design Solutions", type: "FLIPBOOK", url: "https://www.designsolutionsmag.co.uk/digital-editions/" },
  { name: "Process & Control", type: "FLIPBOOK", url: "https://processandcontrolmag.co.uk/digital-editions/" },
  { name: "FHS (Factory & Handling Solutions)", type: "FLIPBOOK", url: "https://www.factoryandhandlingsolutions.co.uk/digital-editions/" },
  { name: "Instrumentation", type: "FLIPBOOK", url: "https://www.instrumentation.co.uk/digital-editions/" },
  { name: "UK Manufacturing", type: "FLIPBOOK", url: "https://www.uk-manufacturing-online.co.uk/digital-editions/" },
];

let created = 0;
const ids = [];
for (const s of SOURCES) {
  const existing = await db.watchedSource.findFirst({ where: { url: s.url } });
  if (existing) {
    ids.push(existing.id);
    continue;
  }
  const row = await db.watchedSource.create({ data: s });
  ids.push(row.id);
  created++;
}

console.log(`Created ${created} new sources (${SOURCES.length} total watched).`);
console.log(ids.join("\n"));
await db.$disconnect();
