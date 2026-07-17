// Full rebuild of 2025+2026 campaigns from the two FileMaker PDFs.
//
// Why: JB verified the correct "On Issue" totals (Mar 26 = £141,027,
// Apr 26 = £148,193) and they equal the simple UNION of both files by Issue
// Date — no dedupe. The hub's old ledger-based MEPCA rows attribute revenue
// to different months, so 2025+ MEPCA is wiped and rebuilt from the files
// alongside the other titles. TSM (The Salon Mag, closed title) is imported
// under a hidden 'salon' magazine so it counts in Cogent/person totals
// without getting a tab.
//
// The 2025 file has no Date column, so old MEPCA sale dates / salespeople /
// content ticks are snapshotted first and matched back on (brand+issue+value).
//
// Usage: node scripts/rebuild-2025-2026.mjs [--dry]

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

const DRY = process.argv.includes("--dry");
const db = new PrismaClient();

const SCRATCH =
  "C:/Users/CIMLTD~1/AppData/Local/Temp/claude/C--Users-CIM-Ltd--claude-Claude-Code-Projects-MEPCA-Hub/28f67e15-364e-44ed-83f8-9d10fe48aa7c/scratchpad/";

const PEOPLE = {
  JTB: "JB", JAMESD: "Hames", MG: "Manj", HH: "HH",
  JIM: "Jim", MBS: "Mike", JAZ: "Jaz", DEC: "Dec", KT: "Katy",
};
const MAG_CODES = {
  MEPCA: "mepca",
  HOT: "hotel", HOTEL: "hotel",
  BAR: "bar",
  CARE: "care-home", CHM: "care-home",
  TGM: "grooming",
  TSM: "salon", // The Salon Mag — hidden title, no tab
};
const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};
const MONTH_LABEL = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const cell = (r, lo, hi) => r.cells.find((c) => c.x >= lo && c.x < hi)?.s?.trim();
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function parseIssue(issue) {
  const tokens = issue.trim().split(/\s+/);
  const slug = MAG_CODES[tokens[0].toUpperCase()];
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
  // canc/canx/cancel…, duped, moved, ignore = dead rows, not sales
  if (/canx|canc|xxx|duped|moved|ignore/i.test(raw)) return { amount: 0, cancelled: true };
  const n = Number(raw.replace(/\+?\s*vat/i, "").replace(/[£,\s]/g, ""));
  return { amount: isNaN(n) ? 0 : n, cancelled: false }; // FREE / pop / "?" → £0
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

function toRecords(file, { hasExtras }) {
  const skipped = { cancelled: 0, miele: 0, unknown: { n: 0, sum: 0 }, noDate: 0, mepcaPre2025: 0 };
  const records = [];
  for (const r of loadRows(file)) {
    const company = cell(r, 20, 240) ?? "";
    const pkg = cell(r, 240, 340) ?? "";
    const issueRaw = cell(r, 500, 640) ?? "";
    const { amount, cancelled } = parseAmount(cell(r, 340, 470));
    const sp = hasExtras ? (cell(r, 640, 700) ?? "").toUpperCase() : "";
    const saleDate = hasExtras ? parseUkDate(cell(r, 760, 860)) : null;

    if (/miele/i.test(company) && /magazine/i.test(issueRaw)) { skipped.miele++; continue; }
    if (cancelled) { skipped.cancelled++; continue; }

    const { slug, month, year } = parseIssue(issueRaw);
    if (!slug) { skipped.unknown.n++; skipped.unknown.sum += amount; continue; }

    let startDate = null, endDate = null, issueLabel = null;
    if (month !== null && year !== null) {
      startDate = new Date(year, month, 1);
      endDate = new Date(year, month + 1, 0);
      issueLabel = `${MONTH_LABEL[month]} ${year}`;
    } else if (!saleDate) {
      skipped.noDate++;
      continue;
    }
    // else: annual/unspecified deal — keep dateless so it never lands on an
    // On Issue month (matches the FM ledger); Monthly Sales uses saleDate.

    // MEPCA issues before 2025 already live in the hub's 2023-24 history
    if (slug === "mepca" && startDate && startDate < new Date(2025, 0, 1)) { skipped.mepcaPre2025++; continue; }

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
  if (!startDate || !endDate) return "COMPLETED"; // dateless annual deals
  if (endDate < now) return "COMPLETED";
  if (startDate <= now) return "LIVE";
  return "UPCOMING";
}

async function main() {
  // 1. Snapshot old MEPCA extras before deletion, to reattach to new rows
  const oldMepca = await db.campaign.findMany({
    where: { magazineId: "mepca", startDate: { gte: new Date(2025, 0, 1) } },
    select: { brand: true, issue: true, value: true, saleDate: true, salesperson: true, contentReceived: true },
  });
  const extras = new Map();
  for (const c of oldMepca) {
    const key = `${norm(c.brand)}|${c.issue ?? ""}|${Number(c.value ?? 0)}`;
    extras.set(key, [...(extras.get(key) ?? []), c]);
  }

  // 2. Parse the files (union, no dedupe — matches JB's verified totals).
  // The top-up file (FM July 26.pdf) may re-list rows already in the main
  // 2026 export, so only its genuinely new rows are added.
  const f25 = toRecords("cim-fm-rows-2025.json", { hasExtras: false });
  const f26 = toRecords("cim-fm-rows.json", { hasExtras: true });
  const fJul = toRecords("cim-fm-rows-jul.json", { hasExtras: true });
  const seen = new Map();
  for (const r of [...f25.records, ...f26.records]) {
    const k = `${norm(r.brand)}|${norm(r.package)}|${r.issue}|${r.value}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const julNew = fJul.records.filter((r) => {
    const k = `${norm(r.brand)}|${norm(r.package)}|${r.issue}|${r.value}`;
    if ((seen.get(k) ?? 0) > 0) { seen.set(k, seen.get(k) - 1); return false; }
    return true;
  });
  console.log(`top-up file: ${fJul.records.length} rows, ${julNew.length} new`);
  const all = [...f25.records, ...f26.records, ...julNew];

  // 3. Reattach old MEPCA sale dates / salespeople / content ticks
  let reattached = 0;
  for (const rec of all) {
    if (rec.magazineId !== "mepca" || rec.saleDate) continue;
    const key = `${norm(rec.brand)}|${rec.issue ?? ""}|${rec.value}`;
    const match = extras.get(key)?.shift();
    if (match) {
      rec.saleDate = match.saleDate;
      rec.salesperson = rec.salesperson ?? match.salesperson;
      rec.contentReceived = match.contentReceived;
      reattached++;
    }
  }

  // Report
  const summary = {};
  const byIssue = {};
  let total26 = 0;
  for (const r of all) {
    summary[r.magazineId] = summary[r.magazineId] || { n: 0, sum: 0 };
    summary[r.magazineId].n++;
    summary[r.magazineId].sum += r.value;
    if (r.issue?.endsWith("2026")) {
      byIssue[r.issue] = (byIssue[r.issue] ?? 0) + r.value;
      total26 += r.value;
    }
  }
  console.log("=== to insert (union of the files) ===");
  for (const [k, v] of Object.entries(summary))
    console.log(` ${k}: ${v.n} bookings £${Math.round(v.sum).toLocaleString("en-GB")}`);
  console.log("skipped 2025 file:", JSON.stringify(f25.skipped));
  console.log("skipped 2026 file:", JSON.stringify(f26.skipped));
  console.log(`old MEPCA rows to delete: ${oldMepca.length}; extras reattached to new rows: ${reattached}`);
  const WANT = { "Jan 2026": 104213, "Feb 2026": 113490, "Mar 2026": 141027, "Apr 2026": 148193,
    "May 2026": 136622, "Jun 2026": 150188, "Jul 2026": 148088, "Aug 2026": 111957 };
  console.log("=== ACCEPTANCE vs JB's FM ledger ===");
  for (const [k, want] of Object.entries(WANT)) {
    const have = Math.round(byIssue[k] ?? 0);
    console.log(` ${k}: £${have.toLocaleString("en-GB")} (JB £${want.toLocaleString("en-GB")}, diff ${(have - want).toLocaleString("en-GB")})`);
  }
  console.log(` 2026 issues total: £${Math.round(total26).toLocaleString("en-GB")} (JB £1,365,214)`);

  if (DRY) { console.log("(dry run — nothing written)"); return; }

  // 4. Hidden Salon magazine for TSM rows
  await db.magazine.upsert({
    where: { id: "salon" },
    create: { id: "salon", name: "The Salon Mag", siteUrl: "", sortOrder: 99, active: false },
    update: {},
  });

  // 5. Wipe and rebuild
  const del = await db.campaign.deleteMany({
    where: {
      OR: [
        { magazineId: { notIn: ["mepca"] } },
        { magazineId: "mepca", startDate: { gte: new Date(2025, 0, 1) } },
        { magazineId: "mepca", startDate: null }, // dateless annual deals from prior runs
      ],
    },
  });
  console.log("deleted:", del.count);

  let inserted = 0;
  for (let i = 0; i < all.length; i += 100) {
    const chunk = all.slice(i, i + 100).map((r) => ({
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
      contentReceived: r.contentReceived ?? false,
      notes: r.notes,
    }));
    const res = await db.campaign.createMany({ data: chunk });
    inserted += res.count;
    process.stdout.write(`\rinserted ${inserted}/${all.length}`);
  }
  console.log("\ndone");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
