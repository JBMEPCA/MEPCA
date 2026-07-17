// Server-only: parse a FileMaker sales-ledger PDF (the wide per-issue export
// JB sends — works for a whole year or a single month) and sync it into the
// hub. Every issue-month present in the file is replaced wholesale, so
// re-uploading is always safe: no duplicates, deletions and corrections
// included. Encodes all the rules established during the 2025/2026 import:
//
//  - columns are located by x-position (FileMaker prints have no delimiters)
//  - cancelled rows (canx/canc/xxx/duped/moved/ignore) are dead — skipped
//  - Miele "X MAGAZINE" rows are duplicate invoices — skipped
//  - FREE / pop / "?" are real £0 placements — kept
//  - "+VAT" suffixes stripped from amounts
//  - dates stored at noon UTC of the UK calendar day (timezone-proof)
//  - salesperson initials → hub names; unknown initials kept as-is
//  - TSM (The Salon Mag) → hidden 'salon' magazine
//  - control bytes stripped (Postgres rejects NUL)

import { createRequire } from "module";
import { db } from "@/lib/db";

const require_ = createRequire(import.meta.url);

const PEOPLE: Record<string, string> = {
  JTB: "JB", JAMESD: "Hames", MG: "Manj", HH: "HH",
  JIM: "Jim", MBS: "Mike", JAZ: "Jaz", DEC: "Dec", KT: "Katy",
};
const MAG_CODES: Record<string, string> = {
  MEPCA: "mepca", HOT: "hotel", HOTEL: "hotel", BAR: "bar",
  CARE: "care-home", CHM: "care-home", TGM: "grooming", TSM: "salon",
};
const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};
const MONTH_LABEL = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

type Cell = { x: number; s: string };
type Line = { cells: Cell[] };

async function extractLines(data: Buffer): Promise<Line[]> {
  const pdfjs = require_("pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const lines: Line[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const byY = new Map<number, Cell[]>();
    for (const it of tc.items as { str: string; transform: number[] }[]) {
      if (!it.str.trim()) continue;
      const y = Math.round(it.transform[5]);
      if (!byY.has(y)) byY.set(y, []);
      byY.get(y)!.push({ x: it.transform[4], s: it.str });
    }
    for (const cells of byY.values()) {
      cells.sort((a, b) => a.x - b.x);
      lines.push({ cells });
    }
  }
  return lines;
}

// Control chars (incl. NUL) that Postgres rejects — built from escapes so no
// literal control bytes live in this source file.
const CTRL = new RegExp("[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f]", "g");
const cell = (r: Line, lo: number, hi: number) =>
  r.cells.find((c) => c.x >= lo && c.x < hi)?.s?.replace(CTRL, "")?.trim();

function parseIssue(issue: string) {
  const tokens = issue.trim().split(/\s+/);
  const slug = MAG_CODES[tokens[0]?.toUpperCase() ?? ""];
  let month: number | null = null;
  let year: number | null = null;
  for (const t of tokens.slice(1)) {
    const m = MONTHS[t.toLowerCase().slice(0, 4)] ?? MONTHS[t.toLowerCase().slice(0, 3)];
    if (m !== undefined && month === null) month = m;
    if (/^\d{2}$/.test(t)) year = 2000 + Number(t);
    if (/^\d{4}$/.test(t)) year = Number(t);
  }
  return { slug, month, year };
}

function parseAmount(raw: string | undefined) {
  if (!raw) return { amount: 0, cancelled: false };
  if (/canx|canc|xxx|duped|moved|ignore/i.test(raw)) return { amount: 0, cancelled: true };
  const n = Number(raw.replace(/\+?\s*vat/i, "").replace(/[£,\s]/g, ""));
  return { amount: isNaN(n) ? 0 : n, cancelled: false };
}

function parseUkDate(s: string | undefined) {
  const m = (s ?? "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12)) : null;
}

export type SyncResult = {
  months: { issue: string; rows: number; total: number; deleted: number }[];
  skipped: { cancelled: number; miele: number; unknownIssues: string[] };
  error?: string;
};

export async function syncLedgerPdf(data: Buffer): Promise<SyncResult> {
  const lines = (await extractLines(data)).filter(
    (r) => r.cells.some((c) => c.x < 40) && r.cells.some((c) => c.x >= 500 && c.x < 640)
  );

  const skipped = { cancelled: 0, miele: 0, unknownIssues: [] as string[] };
  const unknown = new Set<string>();

  type Rec = {
    magazineId: string; brand: string; package: string; value: number;
    issue: string; startDate: Date; endDate: Date; saleDate: Date | null;
    salesperson: string | null; contentReceived?: boolean;
  };
  const byIssue = new Map<string, Rec[]>();

  for (const r of lines) {
    const brand = cell(r, 20, 240) ?? "";
    const issueRaw = cell(r, 500, 640) ?? "";
    const { amount, cancelled } = parseAmount(cell(r, 340, 470));
    if (/miele/i.test(brand) && /magazine/i.test(issueRaw)) { skipped.miele++; continue; }
    if (cancelled) { skipped.cancelled++; continue; }
    const { slug, month, year } = parseIssue(issueRaw);
    if (!slug || month === null || year === null) {
      if (issueRaw) unknown.add(issueRaw);
      continue;
    }
    const issue = `${MONTH_LABEL[month]} ${year}`;
    const sp = (cell(r, 640, 700) ?? "").toUpperCase();
    if (!byIssue.has(issue)) byIssue.set(issue, []);
    byIssue.get(issue)!.push({
      magazineId: slug,
      brand,
      package: cell(r, 240, 340) || "Booking",
      value: amount,
      issue,
      startDate: new Date(Date.UTC(year, month, 1, 12)),
      endDate: new Date(Date.UTC(year, month + 1, 0, 12)),
      saleDate: parseUkDate(cell(r, 760, 860)),
      salesperson: PEOPLE[sp] ?? (sp || null),
    });
  }
  skipped.unknownIssues = [...unknown];

  if (byIssue.size === 0) {
    return {
      months: [],
      skipped,
      error:
        "No bookings found — is this the FileMaker sales ledger PDF (the wide export with Issue Date and Sales Person columns)?",
    };
  }

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const months: SyncResult["months"] = [];

  for (const [issue, records] of byIssue) {
    // Preserve content-received ticks across the swap
    const old = await db.campaign.findMany({
      where: { issue, contentReceived: true },
      select: { brand: true, value: true },
    });
    const ticks = new Map<string, number>();
    for (const c of old) {
      const k = `${norm(c.brand)}|${Number(c.value ?? 0)}`;
      ticks.set(k, (ticks.get(k) ?? 0) + 1);
    }
    for (const rec of records) {
      const k = `${norm(rec.brand)}|${rec.value}`;
      if ((ticks.get(k) ?? 0) > 0) { ticks.set(k, ticks.get(k)! - 1); rec.contentReceived = true; }
    }

    const del = await db.campaign.deleteMany({ where: { issue } });
    const now = new Date();
    await db.campaign.createMany({
      data: records.map((r) => ({
        ...r,
        status: r.endDate < now ? "COMPLETED" : r.startDate <= now ? "LIVE" : "UPCOMING",
        contentReceived: r.contentReceived ?? false,
      })),
    });
    months.push({
      issue,
      rows: records.length,
      total: Math.round(records.reduce((s, r) => s + r.value, 0)),
      deleted: del.count,
    });
  }

  return { months, skipped };
}
