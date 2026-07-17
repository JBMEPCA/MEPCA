// THE definitive 2025/2026 rebuild: JB's full per-ISSUE-year ledgers
// ("2025 FM PDF.pdf", "2026 FM.pdf") contain every booking for issues in that
// year — whenever it was booked — with Sales Person and Date columns
// throughout. They supersede the earlier per-booking-year exports and the
// individual month ledgers.
//
// Replaces all campaigns with a 2025 or 2026 issue date. Keeps: MEPCA 2023-24
// history, 2027-issue bookings, and the dateless annual deals (none of which
// appear in issue-filtered ledgers). Content ticks are preserved by
// brand+issue+value matching.
//
// Usage: node scripts/rebuild-from-issue-ledgers.mjs [--dry]

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

const DRY = process.argv.includes("--dry");
const db = new PrismaClient();
const SCRATCH =
  "C:/Users/CIMLTD~1/AppData/Local/Temp/claude/C--Users-CIM-Ltd--claude-Claude-Code-Projects-MEPCA-Hub/28f67e15-364e-44ed-83f8-9d10fe48aa7c/scratchpad/";

const FILES = [
  { file: "full-2025.json", issueYear: 2025 },
  { file: "full-2026.json", issueYear: 2026 },
];

const PEOPLE = {
  JTB: "JB", JAMESD: "Hames", MG: "Manj", HH: "HH",
  JIM: "Jim", MBS: "Mike", JAZ: "Jaz", DEC: "Dec", KT: "Katy",
};
const MAG_CODES = {
  MEPCA: "mepca", HOT: "hotel", HOTEL: "hotel", BAR: "bar",
  CARE: "care-home", CHM: "care-home", TGM: "grooming", TSM: "salon",
};
const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};
const MONTH_LABEL = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// PDF extraction can smuggle NUL/control bytes in - Postgres rejects them
const CTRL = new RegExp("[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f]", "g");
const cell = (r, lo, hi) =>
  r.cells.find((c) => c.x >= lo && c.x < hi)?.s?.replace(CTRL, "")?.trim();
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
  if (/canx|canc|xxx|duped|moved|ignore/i.test(raw)) return { amount: 0, cancelled: true };
  const n = Number(raw.replace(/\+?\s*vat/i, "").replace(/[£,\s]/g, ""));
  return { amount: isNaN(n) ? 0 : n, cancelled: false }; // FREE / pop / "?" → £0
}

function parseUkDate(s) {
  const m = (s ?? "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
}

async function main() {
  const records = [];
  for (const { file, issueYear } of FILES) {
    const rows = JSON.parse(readFileSync(SCRATCH + file, "utf8")).filter(
      (r) => r.cells.some((c) => c.x < 40) && r.cells.some((c) => c.x >= 500 && c.x < 640)
    );
    let cancelled = 0, miele = 0;
    const strays = new Map();
    let fileSum = 0, fileN = 0;
    for (const r of rows) {
      const company = cell(r, 20, 240) ?? "";
      const issueRaw = cell(r, 500, 640) ?? "";
      const amt = parseAmount(cell(r, 340, 470));
      if (/miele/i.test(company) && /magazine/i.test(issueRaw)) { miele++; continue; }
      if (amt.cancelled) { cancelled++; continue; }
      const { slug, month, year } = parseIssue(issueRaw);
      if (!slug || month === null || year !== issueYear) {
        strays.set(issueRaw, (strays.get(issueRaw) ?? 0) + 1);
        continue;
      }
      const sp = (cell(r, 640, 700) ?? "").toUpperCase();
      records.push({
        magazineId: slug,
        brand: company,
        package: cell(r, 240, 340) || "Booking",
        value: amt.amount,
        issue: `${MONTH_LABEL[month]} ${year}`,
        startDate: new Date(year, month, 1),
        endDate: new Date(year, month + 1, 0),
        saleDate: parseUkDate(cell(r, 760, 860)),
        salesperson: PEOPLE[sp] ?? (sp || null),
      });
      fileSum += amt.amount;
      fileN++;
    }
    console.log(`${file}: ${fileN} rows £${Math.round(fileSum).toLocaleString("en-GB")} · ${cancelled} cancelled · ${miele} Miele` +
      (strays.size ? ` · STRAYS: ${[...strays.entries()].map(([k, n]) => `${k}×${n}`).join("; ")}` : ""));
  }

  // Per-month 2026 acceptance check
  const WANT = { "Jan 2026": 104213, "Feb 2026": 113490, "Mar 2026": 141027, "Apr 2026": 148193,
    "May 2026": 136622, "Jun 2026": 150188, "Jul 2026": 148088, "Aug 2026": 111957 };
  const byIssue = {};
  let unattributed = 0;
  for (const r of records) {
    byIssue[r.issue] = (byIssue[r.issue] ?? 0) + r.value;
    if (!r.salesperson) unattributed += r.value;
  }
  for (const [k, want] of Object.entries(WANT)) {
    const have = Math.round(byIssue[k] ?? 0);
    console.log(` ${k}: £${have.toLocaleString("en-GB")}${have === want ? " ✓" : ` (JB £${want.toLocaleString("en-GB")}, diff ${(have - want).toLocaleString("en-GB")})`}`);
  }
  console.log(` Nov 2026: £${Math.round(byIssue["Nov 2026"] ?? 0).toLocaleString("en-GB")}`);
  const t26 = Object.entries(byIssue).filter(([k]) => k.endsWith("2026")).reduce((s, [, v]) => s + v, 0);
  const t25 = Object.entries(byIssue).filter(([k]) => k.endsWith("2025")).reduce((s, [, v]) => s + v, 0);
  console.log(` 2025 issues: £${Math.round(t25).toLocaleString("en-GB")} (FM total sales £1,448,262)`);
  console.log(` 2026 issues: £${Math.round(t26).toLocaleString("en-GB")} (FM total sales £1,365,214)`);
  console.log(` unattributed value in new data: £${Math.round(unattributed).toLocaleString("en-GB")}`);

  if (DRY) { console.log("(dry run — nothing written)"); return; }

  // Preserve content ticks from replaced rows
  const old = await db.campaign.findMany({
    where: { startDate: { gte: new Date(2025, 0, 1), lt: new Date(2027, 0, 1) }, contentReceived: true },
    select: { brand: true, issue: true, value: true },
  });
  const ticks = new Map();
  for (const c of old) {
    const k = `${norm(c.brand)}|${c.issue ?? ""}|${Number(c.value ?? 0)}`;
    ticks.set(k, (ticks.get(k) ?? 0) + 1);
  }
  for (const r of records) {
    const k = `${norm(r.brand)}|${r.issue}|${r.value}`;
    if ((ticks.get(k) ?? 0) > 0) { ticks.set(k, ticks.get(k) - 1); r.contentReceived = true; }
  }

  const del = await db.campaign.deleteMany({
    where: { startDate: { gte: new Date(2025, 0, 1), lt: new Date(2027, 0, 1) } },
  });
  console.log("deleted:", del.count);

  const now = new Date();
  let inserted = 0;
  for (let i = 0; i < records.length; i += 100) {
    const chunk = records.slice(i, i + 100).map((r) => ({
      ...r,
      status: r.endDate < now ? "COMPLETED" : r.startDate <= now ? "LIVE" : "UPCOMING",
      contentReceived: r.contentReceived ?? false,
    }));
    inserted += (await db.campaign.createMany({ data: chunk })).count;
    process.stdout.write(`\rinserted ${inserted}/${records.length}`);
  }
  console.log("\ndone");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
