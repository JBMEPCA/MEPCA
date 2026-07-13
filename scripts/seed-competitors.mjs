// One-off local seed: loads the Lead Sourcing spreadsheet into the
// CompetitorAdvertiser table. Safe to re-run — rows update, not duplicate.
// Usage: node scripts/seed-competitors.mjs [path-to-xlsx]
import { PrismaClient } from "@prisma/client";
import XLSX from "xlsx";

const filePath =
  process.argv[2] ??
  "C:\\Users\\CIM Ltd\\Claude\\Projects\\Lead Sourcing\\MEPCA_Competitor_Advertisers_Pilot.xlsx";

const db = new PrismaClient();

const dedupeKeyFor = (brand, magazine, adType) =>
  [brand, magazine, adType ?? ""].map((s) => s.toLowerCase().trim()).join("|");

const workbook = XLSX.readFile(filePath);
const sheet = workbook.Sheets["Advertisers"] ?? workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet);

let imported = 0;
let skipped = 0;
const now = new Date();

for (const row of rows) {
  const brand = row.Brand?.toString().trim();
  const magazine = row["Competitor Magazine"]?.toString().trim();
  if (!brand || !magazine) {
    skipped++;
    continue;
  }
  const adType = row["Ad Type"]?.toString().trim() || null;
  const key = dedupeKeyFor(brand, magazine, adType);
  await db.competitorAdvertiser.upsert({
    where: { dedupeKey: key },
    create: {
      brand,
      competitorMagazine: magazine,
      adType,
      whereFound: row["Where Found"]?.toString().trim() || null,
      confidenceNotes: row["Confidence / Notes"]?.toString().trim() || null,
      source: row.Source?.toString().trim() || null,
      dedupeKey: key,
      lastImportedAt: now,
    },
    update: {
      whereFound: row["Where Found"]?.toString().trim() || null,
      confidenceNotes: row["Confidence / Notes"]?.toString().trim() || null,
      source: row.Source?.toString().trim() || null,
      lastImportedAt: now,
    },
  });
  imported++;
}

console.log(`Done: ${imported} advertisers imported/updated, ${skipped} rows skipped.`);
await db.$disconnect();
