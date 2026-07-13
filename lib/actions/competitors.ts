"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";

// Matches the layout the mepca-competitor-advertisers skill writes:
// sheet "Advertisers" with columns
// Brand | Competitor Magazine | Ad Type | Where Found | Confidence / Notes | Source
type SheetRow = {
  Brand?: string;
  "Competitor Magazine"?: string;
  "Ad Type"?: string;
  "Where Found"?: string;
  "Confidence / Notes"?: string;
  Source?: string;
};

function dedupeKeyFor(brand: string, magazine: string, adType: string | null) {
  return [brand, magazine, adType ?? ""].map((s) => s.toLowerCase().trim()).join("|");
}

export async function importCompetitorSheet(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No file uploaded");

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets["Advertisers"] ?? workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("No worksheet found in file");

  const rows = XLSX.utils.sheet_to_json<SheetRow>(sheet);
  const now = new Date();
  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const brand = row.Brand?.toString().trim();
    const magazine = row["Competitor Magazine"]?.toString().trim();
    if (!brand || !magazine) {
      skipped++;
      continue;
    }
    const adType = row["Ad Type"]?.toString().trim() || null;

    await db.competitorAdvertiser.upsert({
      where: { dedupeKey: dedupeKeyFor(brand, magazine, adType) },
      create: {
        brand,
        competitorMagazine: magazine,
        adType,
        whereFound: row["Where Found"]?.toString().trim() || null,
        confidenceNotes: row["Confidence / Notes"]?.toString().trim() || null,
        source: row.Source?.toString().trim() || null,
        dedupeKey: dedupeKeyFor(brand, magazine, adType),
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

  revalidatePath("/competitor-intel");
  return { imported, skipped };
}

export async function toggleGoodTarget(id: string, value: boolean) {
  await db.competitorAdvertiser.update({ where: { id }, data: { goodTarget: value } });
  revalidatePath("/competitor-intel");
}

export async function togglePitched(id: string, value: boolean) {
  await db.competitorAdvertiser.update({ where: { id }, data: { pitched: value } });
  revalidatePath("/competitor-intel");
}

// One-click handoff: turn a flagged competitor advertiser into a pipeline pitch
export async function addToPipeline(id: string) {
  const advertiser = await db.competitorAdvertiser.findUniqueOrThrow({ where: { id } });
  await db.pipelineItem.create({
    data: {
      brand: advertiser.brand,
      notes: `From competitor intel: seen in ${advertiser.competitorMagazine}` +
        (advertiser.adType ? ` (${advertiser.adType})` : ""),
    },
  });
  await db.competitorAdvertiser.update({ where: { id }, data: { pitched: true } });
  revalidatePath("/competitor-intel");
  revalidatePath("/pipeline");
}
