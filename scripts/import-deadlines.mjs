// Imports issue deadlines for ALL magazines from the Deadlines workbook.
// One sheet per year; every title has an "<Name> Edit" + "<Name> Ads" column
// pair and the same marker vocabulary (month label announces the issue in the
// Edit column; SALES DL / 100% ADS / PRINT land in the Ads column).
// Quirk: each sheet's date column runs 4 years behind the sheet name (an old
// template that was never re-dated), so we shift every date forward to match.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
import { PrismaClient } from "@prisma/client";

const SHEET = process.argv[2] ?? "2026";
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// magazine slug -> the column-name prefix used in the workbook
const COLUMN_PREFIXES = {
  mepca: "MEPCA",
  hotel: "Hotel",
  bar: "Bar",
  grooming: "TGM",
  "care-home": "Care Home",
};

const wb = XLSX.readFile("C:\\Users\\CIM Ltd\\Desktop\\Deadlines 2026.xlsx", { cellDates: true });
const sheet = wb.Sheets[SHEET];
if (!sheet) throw new Error(`No sheet named ${SHEET}`);
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
const header = rows[0];

// Work out the year offset: first row is late December of (real year - 1)
const firstDate = rows.find((r) => r[0] instanceof Date)?.[0];
const anchor = new Date(firstDate.getTime() + 6 * 86400000);
const offset = Number(SHEET) - anchor.getUTCFullYear();
console.log(`sheet ${SHEET}: date offset +${offset} years`);

function shift(d) {
  const nd = new Date(d);
  nd.setUTCFullYear(nd.getUTCFullYear() + offset);
  return nd;
}

function parseMagazine(prefix) {
  const editCol = header.findIndex((h) => String(h).trim() === `${prefix} Edit`);
  const adsCol = header.findIndex((h) => String(h).trim() === `${prefix} Ads`);
  if (editCol < 0 || adsCol < 0) return null;

  const issues = new Map(); // issue -> { issueDate, salesDeadline, adsDeadline, printDate }
  let currentIssue = null;

  for (const row of rows.slice(1)) {
    const rawDate = row[0];
    if (!(rawDate instanceof Date)) continue;
    const realDate = shift(rawDate);

    const editCell = String(row[editCol]).trim();
    const monthIdx = MONTH_NAMES.indexOf(editCell);
    if (monthIdx >= 0) {
      // month label announces which issue the following deadlines belong to
      let year = realDate.getUTCFullYear();
      if (monthIdx < realDate.getUTCMonth()) year += 1;
      currentIssue = `${MONTH_NAMES[monthIdx]} ${year}`;
      if (!issues.has(currentIssue)) {
        issues.set(currentIssue, {
          issueDate: new Date(Date.UTC(year, monthIdx, 1)),
        });
      }
    }

    if (!currentIssue) continue;
    const adsCell = String(row[adsCol]).trim().toUpperCase();
    const entry = issues.get(currentIssue);
    if (adsCell === "SALES DL") entry.salesDeadline = realDate;
    else if (adsCell === "100% ADS") entry.adsDeadline = realDate;
    else if (adsCell === "PRINT") entry.printDate = realDate;
  }
  return issues;
}

const db = new PrismaClient();
for (const [magazineId, prefix] of Object.entries(COLUMN_PREFIXES)) {
  const issues = parseMagazine(prefix);
  if (!issues) {
    console.log(`${magazineId}: columns "${prefix} Edit/Ads" not found — skipped`);
    continue;
  }
  let saved = 0;
  for (const [issue, data] of issues) {
    if (!data.adsDeadline && !data.salesDeadline && !data.printDate) continue;
    await db.issueDeadline.upsert({
      where: { magazineId_issue: { magazineId, issue } },
      create: { magazineId, issue, ...data },
      update: data,
    });
    saved++;
  }
  console.log(`${magazineId} (${prefix}): saved ${saved} issue deadline sets`);
  for (const [issue, d] of issues) {
    const f = (x) => (x ? x.toISOString().slice(0, 10) : "—");
    console.log(`  ${issue}: sales ${f(d.salesDeadline)}, 100% ads ${f(d.adsDeadline)}, print ${f(d.printDate)}`);
  }
}
await db.$disconnect();
