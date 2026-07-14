// One-off cleanup: unify competitor magazine name variants so intel data and
// watched sources group together, then add newly confirmed competitor titles.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const CANONICAL = {
  "Factory & Handling Solutions": "Factory & Handling Solutions (FHS)",
  "FHS (Factory & Handling Solutions)": "Factory & Handling Solutions (FHS)",
  "Controls, Drives & Automation": "Controls, Drives & Automation (CDA)",
  "UK Manufacturing": "UK Manufacturing (UKM)",
  "Instrumentation Magazine (Instrumentation Monthly)": "Instrumentation Magazine",
  "Instrumentation": "Instrumentation Magazine",
  "Automation": "Automation Magazine",
  "Process & Control": "Process Control Europe / Process & Control (PCE)",
  "Process Control Europe / Process & Control Engineering":
    "Process Control Europe / Process & Control (PCE)",
  "Measurement & Manufacturing / Machinery & Manufacturing": "Measurement & Manufacturing",
  "Manufacturing & Production Engineering": "Manufacturing & Production Engineering Magazine",
};

const keyFor = (brand, magazine, adType) =>
  [brand, magazine, adType ?? ""].map((s) => s.toLowerCase().trim()).join("|");

// 1. Rename watched sources to canonical names
for (const [from, to] of Object.entries(CANONICAL)) {
  const r = await db.watchedSource.updateMany({ where: { name: from }, data: { name: to } });
  if (r.count) console.log(`source renamed: ${from} -> ${to} (${r.count})`);
}

// 2. Re-home advertiser rows under canonical magazine names (merge duplicates)
let moved = 0;
let merged = 0;
for (const [from, to] of Object.entries(CANONICAL)) {
  const rows = await db.competitorAdvertiser.findMany({ where: { competitorMagazine: from } });
  for (const row of rows) {
    const newKey = keyFor(row.brand, to, row.adType);
    const clash = await db.competitorAdvertiser.findUnique({ where: { dedupeKey: newKey } });
    if (clash && clash.id !== row.id) {
      await db.competitorAdvertiser.update({
        where: { id: clash.id },
        data: {
          goodTarget: clash.goodTarget || row.goodTarget,
          pitched: clash.pitched || row.pitched,
        },
      });
      await db.competitorAdvertiser.delete({ where: { id: row.id } });
      merged++;
    } else {
      await db.competitorAdvertiser.update({
        where: { id: row.id },
        data: { competitorMagazine: to, dedupeKey: newKey },
      });
      moved++;
    }
  }
}
console.log(`advertisers re-homed: ${moved}, duplicates merged: ${merged}`);

// 3. Add newly confirmed competitor titles
const NEW_SOURCES = [
  { name: "PECM (Process Engineering Control & Manufacturing)", url: "https://pecm.co.uk" },
  { name: "Manufacturing Today", url: "https://www.manufacturing-today.com" },
  { name: "Logistics Manager", url: "https://www.logisticsmanager.com" },
  { name: "FDPP (Food & Drink Processing & Packaging Magazine)", url: "https://fdpp.co.uk" },
  { name: "Industrial Technology", url: "https://www.industrialtechnology.co.uk" },
  { name: "DPA Magazine", url: "https://www.dpaonthenet.net" },
  { name: "Control Engineering Europe", url: "https://www.controlengeurope.com" },
  { name: "Manufacturing Management", url: "https://manufacturingmanagement.co.uk" },
  { name: "Manufacturing Digital", url: "https://manufacturingdigital.com" },
  { name: "MEM (Manufacturing & Engineering Magazine)", url: "https://memuk.org" },
  { name: "Manufacturing & Production Engineering Magazine", url: "https://mpemagazine.co.uk" },
];

let added = 0;
for (const s of NEW_SOURCES) {
  const exists = await db.watchedSource.findFirst({ where: { url: s.url } });
  if (!exists) {
    await db.watchedSource.create({ data: { ...s, type: "WEBSITE" } });
    added++;
  }
}
console.log(`new watched sources: ${added}`);

const total = await db.watchedSource.count();
console.log(`total sources now: ${total}`);
await db.$disconnect();
