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

export async function importCompetitorSheet(magazineId: string, formData: FormData) {
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
    const dedupeKey = dedupeKeyFor(brand, magazine, adType);

    await db.competitorAdvertiser.upsert({
      where: { magazineId_dedupeKey: { magazineId, dedupeKey } },
      create: {
        magazineId,
        brand,
        competitorMagazine: magazine,
        adType,
        whereFound: row["Where Found"]?.toString().trim() || null,
        confidenceNotes: row["Confidence / Notes"]?.toString().trim() || null,
        source: row.Source?.toString().trim() || null,
        dedupeKey,
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

  revalidatePath(`/${magazineId}/competitor-intel`);
  return { imported, skipped };
}

export async function toggleGoodTarget(id: string, value: boolean) {
  const updated = await db.competitorAdvertiser.update({
    where: { id },
    data: { goodTarget: value },
  });
  revalidatePath(`/${updated.magazineId}/competitor-intel`);
}

export async function togglePitched(id: string, value: boolean) {
  const updated = await db.competitorAdvertiser.update({
    where: { id },
    data: { pitched: value },
  });
  revalidatePath(`/${updated.magazineId}/competitor-intel`);
}

// One-click handoff: turn a flagged competitor advertiser into a pipeline pitch
export async function addToPipeline(id: string) {
  const advertiser = await db.competitorAdvertiser.findUniqueOrThrow({ where: { id } });
  await db.pipelineItem.create({
    data: {
      magazineId: advertiser.magazineId,
      brand: advertiser.brand,
      notes: `From competitor intel: seen in ${advertiser.competitorMagazine}` +
        (advertiser.adType ? ` (${advertiser.adType})` : ""),
    },
  });
  await db.competitorAdvertiser.update({ where: { id }, data: { pitched: true } });
  revalidatePath(`/${advertiser.magazineId}/competitor-intel`);
  revalidatePath(`/${advertiser.magazineId}/pipeline`);
}
