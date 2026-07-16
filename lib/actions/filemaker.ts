"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import type { CampaignStatus } from "@prisma/client";

// Repeatable FileMaker import: rows with a FileMaker ID update the existing
// campaign instead of duplicating it, so re-exporting the whole file weekly
// is safe. Header names are matched loosely (case/spacing insensitive) with
// common synonyms, since the exact FileMaker export layout may vary.

const HEADER_SYNONYMS: Record<string, string[]> = {
  fileMakerId: ["filemaker id", "fm id", "record id", "id", "recordid"],
  brand: ["brand", "client", "company", "advertiser", "customer"],
  package: ["package", "spec", "package/spec", "booking", "product", "description"],
  value: ["value", "price", "amount", "cost", "revenue", "total"],
  startDate: ["start date", "start", "from", "live date", "issue date"],
  endDate: ["end date", "end", "to", "finish", "expiry"],
  status: ["status", "state"],
  salesperson: ["sales person", "salesperson", "sold by", "rep", "sales rep", "account manager"],
  notes: ["notes", "comments", "remarks"],
};

function normalise(header: string) {
  return header.toLowerCase().replace(/[^a-z0-9/ ]/g, "").trim();
}

function buildColumnMap(headers: string[]) {
  const map: Record<string, string> = {};
  for (const header of headers) {
    const n = normalise(header);
    for (const [field, synonyms] of Object.entries(HEADER_SYNONYMS)) {
      if (!map[field] && synonyms.includes(n)) map[field] = header;
    }
  }
  return map;
}

function parseStatus(raw: string | undefined): CampaignStatus | undefined {
  if (!raw) return undefined;
  const s = raw.toLowerCase();
  if (s.includes("live") || s.includes("active") || s.includes("running")) return "LIVE";
  if (s.includes("complete") || s.includes("finished") || s.includes("ended") || s.includes("closed")) return "COMPLETED";
  if (s.includes("upcoming") || s.includes("booked") || s.includes("pending") || s.includes("scheduled")) return "UPCOMING";
  return undefined;
}

function parseDate(raw: unknown): Date | null {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date) return raw;
  // Excel serial date number
  if (typeof raw === "number") {
    const d = XLSX.SSF.parse_date_code(raw);
    return d ? new Date(d.y, d.m - 1, d.d) : null;
  }
  const s = String(raw).trim();
  // UK format dd/mm/yyyy
  const uk = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (uk) {
    const year = uk[3].length === 2 ? 2000 + Number(uk[3]) : Number(uk[3]);
    return new Date(year, Number(uk[2]) - 1, Number(uk[1]));
  }
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export async function importFileMakerCsv(magazineId: string, formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No file uploaded");

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (rows.length === 0) return { created: 0, updated: 0, skipped: 0, unmappedHeaders: [] as string[] };

  const headers = Object.keys(rows[0]);
  const map = buildColumnMap(headers);
  if (!map.brand) throw new Error(`Could not find a brand/client column. Headers found: ${headers.join(", ")}`);

  const get = (row: Record<string, unknown>, field: string) =>
    map[field] ? String(row[map[field]] ?? "").trim() : "";

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const brand = get(row, "brand");
    if (!brand) {
      skipped++;
      continue;
    }
    const data = {
      brand,
      package: get(row, "package") || "Imported from FileMaker",
      value: get(row, "value").replace(/[£,\s]/g, "") || null,
      startDate: parseDate(map.startDate ? row[map.startDate] : null),
      endDate: parseDate(map.endDate ? row[map.endDate] : null),
      status: parseStatus(get(row, "status")) ?? "COMPLETED",
      salesperson: get(row, "salesperson") || null,
      notes: get(row, "notes") || null,
    };

    const fileMakerId = get(row, "fileMakerId") || null;
    if (fileMakerId) {
      // FileMaker ids are only stable within one magazine's file
      const existing = await db.campaign.findUnique({
        where: { magazineId_fileMakerId: { magazineId, fileMakerId } },
      });
      if (existing) {
        await db.campaign.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await db.campaign.create({ data: { ...data, magazineId, fileMakerId } });
        created++;
      }
    } else {
      // No stable ID — fall back to brand + start date to avoid duplicates
      const existing = await db.campaign.findFirst({
        where: { magazineId, brand, startDate: data.startDate },
      });
      if (existing) {
        await db.campaign.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await db.campaign.create({ data: { ...data, magazineId } });
        created++;
      }
    }
  }

  revalidatePath(`/${magazineId}/campaigns`);
  const unmappedHeaders = headers.filter((h) => !Object.values(map).includes(h));
  return { created, updated, skipped, unmappedHeaders };
}
