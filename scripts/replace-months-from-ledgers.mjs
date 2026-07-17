// Replace Jan 26 / Feb 26 / Aug 26 issue bookings with JB's per-month FM
// ledgers (Jan 26 FM.pdf, Feb 26 FM.pdf, Aug FM.pdf). The annual "booked in
// 2025/2026" exports miss bookings made OUTSIDE those years (e.g. NADdirect,
// booked Sep 2024 into Jan/Feb 26 issues), so per-issue ledgers are the only
// complete source for a month. Same parsing rules as rebuild-2025-2026.mjs.
//
// Usage: node scripts/replace-months-from-ledgers.mjs [--dry]

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

const DRY = process.argv.includes("--dry");
const db = new PrismaClient();
const SCRATCH =
  "C:/Users/CIMLTD~1/AppData/Local/Temp/claude/C--Users-CIM-Ltd--claude-Claude-Code-Projects-MEPCA-Hub/28f67e15-364e-44ed-83f8-9d10fe48aa7c/scratchpad/";

const FILES = [
  { file: "cim-fm-rows-sep26.json", issue: "Sep 2026", want: null },
  { file: "cim-fm-rows-oct26.json", issue: "Oct 2026", want: null },
  // "Nov 26 FM.pdf" turned out to contain October again — awaiting real Nov
  { file: "cim-fm-rows-dec26.json", issue: "Dec 2026", want: null },
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
  if (/canx|canc|xxx|duped|moved|ignore/i.test(raw)) return { amount: 0, cancelled: true };
  const n = Number(raw.replace(/\+?\s*vat/i, "").replace(/[£,\s]/g, ""));
  return { amount: isNaN(n) ? 0 : n, cancelled: false };
}

function parseUkDate(s) {
  const m = (s ?? "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
}

async function main() {
  for (const { file, issue: targetIssue, want } of FILES) {
    const rows = JSON.parse(readFileSync(SCRATCH + file, "utf8")).filter(
      (r) => r.cells.some((c) => c.x < 40) && r.cells.some((c) => c.x >= 500 && c.x < 640)
    );

    const records = [];
    let skippedCancelled = 0, skippedMiele = 0;
    const strays = new Set();
    for (const r of rows) {
      const company = cell(r, 20, 240) ?? "";
      const issueRaw = cell(r, 500, 640) ?? "";
      const { amount, cancelled } = parseAmount(cell(r, 340, 470));
      if (/miele/i.test(company) && /magazine/i.test(issueRaw)) { skippedMiele++; continue; }
      if (cancelled) { skippedCancelled++; continue; }
      const { slug, month, year } = parseIssue(issueRaw);
      if (!slug || month === null || year === null) { strays.add(issueRaw); continue; }
      const label = `${MONTH_LABEL[month]} ${year}`;
      if (label !== targetIssue) { strays.add(issueRaw); continue; }
      const sp = (cell(r, 640, 700) ?? "").toUpperCase();
      records.push({
        magazineId: slug,
        brand: company,
        package: cell(r, 240, 340) || "Booking",
        value: amount,
        issue: label,
        startDate: new Date(year, month, 1),
        endDate: new Date(year, month + 1, 0),
        saleDate: parseUkDate(cell(r, 760, 860)),
        salesperson: PEOPLE[sp] ?? (sp || null),
      });
    }

    const total = records.reduce((s, r) => s + r.value, 0);
    console.log(`${targetIssue}: ${records.length} ledger rows £${Math.round(total).toLocaleString("en-GB")}${want ? ` (JB £${want.toLocaleString("en-GB")})` : ""}` +
      (skippedCancelled ? ` · ${skippedCancelled} cancelled` : "") +
      (skippedMiele ? ` · ${skippedMiele} Miele` : "") +
      (strays.size ? ` · STRAY ISSUES: ${[...strays].join("; ")}` : ""));

    if (DRY) continue;

    // Preserve content ticks from the rows being replaced
    const old = await db.campaign.findMany({
      where: { issue: targetIssue },
      select: { brand: true, value: true, contentReceived: true },
    });
    const ticks = new Map();
    for (const c of old.filter((c) => c.contentReceived)) {
      const k = `${norm(c.brand)}|${Number(c.value ?? 0)}`;
      ticks.set(k, (ticks.get(k) ?? 0) + 1);
    }
    for (const r of records) {
      const k = `${norm(r.brand)}|${r.value}`;
      if ((ticks.get(k) ?? 0) > 0) { ticks.set(k, ticks.get(k) - 1); r.contentReceived = true; }
    }

    const del = await db.campaign.deleteMany({ where: { issue: targetIssue } });
    const now = new Date();
    const ins = await db.campaign.createMany({
      data: records.map((r) => ({
        ...r,
        status: r.endDate < now ? "COMPLETED" : r.startDate <= now ? "LIVE" : "UPCOMING",
        contentReceived: r.contentReceived ?? false,
      })),
    });
    console.log(`  replaced: deleted ${del.count}, inserted ${ins.count}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
