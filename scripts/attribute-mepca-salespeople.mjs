// Follow-up to import-fm-2025-2026: the 2026-file MEPCA rows that matched
// campaigns already in the hub were skipped as duplicates — correctly — but
// their Sales Person then never reached those existing campaigns. This pass
// copies salesperson + sale date onto the matched rows.

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

const db = new PrismaClient();
const SCRATCH =
  "C:/Users/CIMLTD~1/AppData/Local/Temp/claude/C--Users-CIM-Ltd--claude-Claude-Code-Projects-MEPCA-Hub/28f67e15-364e-44ed-83f8-9d10fe48aa7c/scratchpad/";

const PEOPLE = {
  JTB: "JB", JAMESD: "Hames", MG: "Manj", HH: "HH",
  JIM: "Jim", MBS: "Mike", JAZ: "Jaz", DEC: "Dec",
};
const MONTHS = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,june:5,jul:6,july:6,aug:7,sep:8,sept:8,oct:9,nov:10,dec:11 };
const MONTH_LABEL = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const cell = (r, lo, hi) => r.cells.find((c) => c.x >= lo && c.x < hi)?.s?.trim();
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function issueLabel(issue) {
  const tokens = issue.trim().split(/\s+/);
  let month = null, year = null;
  for (const t of tokens.slice(1)) {
    const m = MONTHS[t.toLowerCase().slice(0, 4)] ?? MONTHS[t.toLowerCase().slice(0, 3)];
    if (m !== undefined && month === null) month = m;
    if (/^\d{2}$/.test(t)) year = 2000 + Number(t);
    if (/^\d{4}$/.test(t)) year = Number(t);
  }
  return month !== null && year !== null ? `${MONTH_LABEL[month]} ${year}` : null;
}

function parseUkDate(s) {
  const m = (s ?? "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
}

async function main() {
  const rows = JSON.parse(readFileSync(SCRATCH + "cim-fm-rows.json", "utf8")).filter(
    (r) => r.cells.some((c) => c.x < 40) && r.cells.some((c) => c.x >= 500 && c.x < 640)
  );

  // Existing MEPCA campaigns still missing a salesperson, matchable by key
  const existing = await db.campaign.findMany({
    where: { magazineId: "mepca", salesperson: null },
    select: { id: true, brand: true, issue: true, value: true },
  });
  const pool = new Map();
  for (const c of existing) {
    const key = `${norm(c.brand)}|${c.issue ?? ""}|${Number(c.value ?? 0)}`;
    pool.set(key, [...(pool.get(key) ?? []), c.id]);
  }

  let updated = 0, noMatch = 0;
  for (const r of rows) {
    const issueRaw = cell(r, 500, 640) ?? "";
    if (!issueRaw.toUpperCase().startsWith("MEPCA")) continue;
    const company = cell(r, 20, 240) ?? "";
    const sp = PEOPLE[(cell(r, 640, 700) ?? "").toUpperCase()];
    if (!sp) continue;
    const amtRaw = (cell(r, 340, 470) ?? "").replace(/[£,\s]/g, "");
    if (/canx|cancel|xxx/i.test(amtRaw)) continue;
    const amount = isNaN(Number(amtRaw)) ? 0 : Number(amtRaw);
    const label = issueLabel(issueRaw);
    const key = `${norm(company)}|${label ?? ""}|${amount}`;
    const ids = pool.get(key);
    if (ids && ids.length) {
      const id = ids.shift();
      await db.campaign.update({
        where: { id },
        data: { salesperson: sp, saleDate: parseUkDate(cell(r, 760, 860)) ?? undefined },
      });
      updated++;
    } else {
      noMatch++;
    }
  }
  console.log(`updated ${updated} existing MEPCA campaigns with salesperson; ${noMatch} rows had no unattributed match (already inserted or already attributed)`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
