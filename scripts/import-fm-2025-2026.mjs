// One-off import of the 2025 + 2026 FileMaker sales PDFs (already extracted to
// JSON with x/y coordinates by the scratchpad extract scripts).
//
// Rules agreed with JB (16 Jul 2026):
//  - 2025 file: skip ALL MEPCA rows — they are already in the hub (the existing
//    MEPCA data's 2025/2026 totals match the 2025 file to within £30).
//  - 2026 file: import MEPCA rows too, but skip any row that matches an
//    existing MEPCA campaign on brand+issue+value (belt-and-braces dedupe).
//  - Skip every Miele "HOTEL MAGAZINE" row — duplicate invoices per JB.
//  - Skip cancelled rows (amount contains canx / cancel / xxx).
//  - FREE / pop amounts are real placements at £0.
//  - Rows with no issue month but real money (annual deals) get startDate from
//    their sale date; rows for unknown titles (TSM, GroomFest…) are skipped
//    and reported.
//  - Salesperson initials → names per JB's mapping (2026 file only; the 2025
//    file has no salesperson column).
//
// Usage: node scripts/import-fm-2025-2026.mjs [--dry]

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

const DRY = process.argv.includes("--dry");
const db = new PrismaClient();

const SCRATCH =
  "C:/Users/CIMLTD~1/AppData/Local/Temp/claude/C--Users-CIM-Ltd--claude-Claude-Code-Projects-MEPCA-Hub/28f67e15-364e-44ed-83f8-9d10fe48aa7c/scratchpad/";

const PEOPLE = {
  JTB: "JB", JAMESD: "Hames", MG: "Manj", HH: "HH",
  JIM: "Jim", MBS: "Mike", JAZ: "Jaz", DEC: "Dec",
};

// First word of the issue string → magazine slug
const MAG_CODES = {
  MEPCA: "mepca",
  HOT: "hotel", HOTEL: "hotel",
  BAR: "bar",
  CARE: "care-home", CHM: "care-home",
  TGM: "grooming",
};

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};
const MONTH_LABEL = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const cell = (r, lo, hi) => r.cells.find((c) => c.x >= lo && c.x < hi)?.s?.trim();

function parseIssue(issue) {
  // "HOT OCT 25", "TGM February 26", "Bar Mag Sept 25" → { slug, month, year }
  const tokens = issue.trim().split(/\s+/);
  const code = tokens[0].toUpperCase();
  const slug = MAG_CODES[code];
  let month = null, year = null;
  for (const t of tokens.slice(1)) {
    const m = MONTHS[t.toLowerCase().slice(0, 4)] ?? MONTHS[t.toLowerCase().slice(0, 3)];
    if (m !== undefined && month === null) month = m;
    if (/^\d{2}$/.test(t)) year = 2000 + Number(t);
    if (/^\d{4}$/.test(t)) year = Number(t);
  }
  return { slug, month, year };
}

function parseAmount(raw) {
  if (!raw) return { amount: 0, cancelled: false };
  if (/canx|cancel|xxx/i.test(raw)) return { amount: 0, cancelled: true };
  const n = Number(raw.replace(/[£,\s]/g, ""));
  return { amount: isNaN(n) ? 0 : n, cancelled: false }; // FREE / pop → £0
}

function parseUkDate(s) {
  const m = (s ?? "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
}

function loadRows(file) {
  const rows = JSON.parse(readFileSync(SCRATCH + file, "utf8"));
  return rows.filter(
    (r) => r.cells.some((c) => c.x < 40) && r.cells.some((c) => c.x >= 500 && c.x < 640)
  );
}

function toRecords(file, { hasExtras, skipMepca }) {
  const skipped = { cancelled: 0, miele: 0, unknownTitle: {}, mepca2025: 0, noDate: 0 };
  const records = [];

  for (const r of loadRows(file)) {
    const company = cell(r, 20, 240) ?? "";
    const pkg = cell(r, 240, 340) ?? "";
    const issueRaw = cell(r, 500, 640) ?? "";
    const { amount, cancelled } = parseAmount(cell(r, 340, 470));
    const sp = hasExtras ? (cell(r, 640, 700) ?? "").toUpperCase() : "";
    const saleDate = hasExtras ? parseUkDate(cell(r, 760, 860)) : null;

    // Miele "HOTEL MAGAZINE" rows are duplicate invoices — always out
    if (/miele/i.test(company) && /magazine/i.test(issueRaw)) { skipped.miele++; continue; }
    if (cancelled) { skipped.cancelled++; continue; }

    const { slug, month, year } = parseIssue(issueRaw);
    if (!slug) {
      const code = issueRaw.split(" ")[0].toUpperCase() || "(blank)";
      skipped.unknownTitle[code] = skipped.unknownTitle[code] || { n: 0, sum: 0 };
      skipped.unknownTitle[code].n++;
      skipped.unknownTitle[code].sum += amount;
      continue;
    }
    if (skipMepca && slug === "mepca") { skipped.mepca2025++; continue; }

    let startDate, endDate, issueLabel;
    if (month !== null && year !== null) {
      startDate = new Date(year, month, 1);
      endDate = new Date(year, month + 1, 0);
      issueLabel = `${MONTH_LABEL[month]} ${year}`;
    } else if (saleDate) {
      // Annual/unspecified deals: attribute to the month it was booked
      startDate = new Date(saleDate.getFullYear(), saleDate.getMonth(), 1);
      endDate = new Date(saleDate.getFullYear(), saleDate.getMonth() + 1, 0);
      issueLabel = null;
    } else {
      skipped.noDate++;
      continue;
    }

    records.push({
      magazineId: slug,
      brand: company,
      package: pkg || "Booking",
      value: amount,
      issue: issueLabel,
      startDate,
      endDate,
      saleDate,
      salesperson: PEOPLE[sp] ?? (sp || null),
      notes: issueLabel ? null : `Annual deal — no specific issue (was "${issueRaw}")`,
    });
  }
  return { records, skipped };
}

function statusFor(startDate, endDate) {
  const now = new Date();
  if (endDate < now) return "COMPLETED";
  if (startDate <= now) return "LIVE";
  return "UPCOMING";
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

async function main() {
  const f25 = toRecords("cim-fm-rows-2025.json", { hasExtras: false, skipMepca: true });
  const f26 = toRecords("cim-fm-rows.json", { hasExtras: true, skipMepca: false });

  // Dedupe 2026 MEPCA rows against what's already in the hub
  const existing = await db.campaign.findMany({
    where: { magazineId: "mepca" },
    select: { id: true, brand: true, issue: true, value: true },
  });
  const pool = new Map(); // key → count available to consume
  for (const c of existing) {
    const key = `${norm(c.brand)}|${c.issue ?? ""}|${Number(c.value ?? 0)}`;
    pool.set(key, (pool.get(key) ?? 0) + 1);
  }
  let mepcaDuplicates = 0;
  const toInsert = [...f25.records];
  for (const rec of f26.records) {
    if (rec.magazineId === "mepca") {
      const key = `${norm(rec.brand)}|${rec.issue ?? ""}|${rec.value}`;
      if ((pool.get(key) ?? 0) > 0) {
        pool.set(key, pool.get(key) - 1);
        mepcaDuplicates++;
        continue;
      }
    }
    toInsert.push(rec);
  }

  // Report
  const summary = {};
  for (const r of toInsert) {
    summary[r.magazineId] = summary[r.magazineId] || { n: 0, sum: 0 };
    summary[r.magazineId].n++;
    summary[r.magazineId].sum += r.value;
  }
  console.log("=== to insert ===");
  for (const [k, v] of Object.entries(summary))
    console.log(` ${k}: ${v.n} bookings £${Math.round(v.sum).toLocaleString("en-GB")}`);
  console.log("2025 file skipped:", JSON.stringify(f25.skipped));
  console.log("2026 file skipped:", JSON.stringify(f26.skipped));
  console.log("2026 MEPCA rows matching existing hub campaigns (skipped):", mepcaDuplicates);

  if (DRY) { console.log("(dry run — nothing written)"); return; }

  // Insert in chunks
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += 100) {
    const chunk = toInsert.slice(i, i + 100).map((r) => ({
      magazineId: r.magazineId,
      brand: r.brand,
      package: r.package,
      value: r.value,
      startDate: r.startDate,
      endDate: r.endDate,
      status: statusFor(r.startDate, r.endDate),
      saleDate: r.saleDate,
      issue: r.issue,
      salesperson: r.salesperson,
      notes: r.notes,
    }));
    const res = await db.campaign.createMany({ data: chunk });
    inserted += res.count;
    process.stdout.write(`\rinserted ${inserted}/${toInsert.length}`);
  }
  console.log("\ndone");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
