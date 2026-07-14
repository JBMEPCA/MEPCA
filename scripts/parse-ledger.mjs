// Parses the FileMaker ledger text dump into structured bookings.
// Run with --dry to preview without importing.
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

const raw = readFileSync("scripts/ledger-raw.txt", "utf8");
const dry = process.argv.includes("--dry");

// Known ad positions/packages, longest first so e.g. "FP Edit" wins over "Edit"
const POSITIONS = [
  "MARKETING CAMPAIGN", "Marketing Campaign", "Front Cover Package", "Front Cover",
  "Front cover", "Double Page Spread", "Double Page", "DPS Edit", "DPS",
  "Full Page Bleed", "Full Page", "Full page", "full page",
  "Half Page Bleed", "Half Page", "Half page", "Quarter Page", "Quarter page",
  "1/2 Page", "1/2 page", "1/4 Page", "1/4 page", "1/3 Page", "1/3 page",
  "FP Edit", "HP Edit", "QP Edit", "FP edit", "Fp Edit", "fp edit", "HP edit",
  "Secured Edit", "Secured edit", "secured edit", "Colour Sep", "Colour sep",
  "PR Package", "PR package", "E-Newletter", "E-Newsletter", "E-newsletter",
  "Enewsletter", "E-shot", "E-Shot", "Eshot", "e-shot",
  "Web Banner", "Website Banner", "Web banner", "Leaderboard", "Banner", "banner", "MPU",
  "Advertorial", "advertorial", "Insert", "Belly Band", "Belly band", "Bellyband",
  "Sponsorship", "Sponsored Content", "Sponsored content",
  "Back Cover", "Back cover", "Inside Front Cover", "Inside Back Cover",
  "IFC", "IBC", "OBC", "Podcast", "Video", "Webinar", "Social Media", "Editorial",
  "Company Profile", "Business Profile", "Profile", "Case Study", "Feature",
  "Digital Package", "Web Package", "Print & Digital", "Newsletter", "Package",
  "Solutions Focus", "Solutions focus", "solutions focus",
  "Full page + E shot", "Full Page + E-shot", "Full Page + Eshot", "Full page + eshot",
  "eshot", "E shot", "e shot",
  "Video option 1", "Video option 2", "Video option 3", "Video Option", "Video option",
  "Banner 1", "Banner 2", "Banner 3",
  "DIGITAL/PRINT PACKAGE", "Digital/Print Package", "DIGITAL PACKAGE", "PRINT PACKAGE",
  "DIGITAL AND PRINT", "Digital and Print", "Digital & Print",
  "CONTRA PACKAGE", "Contra Package", "Contra package",
  "Web Site Takeover", "Website Takeover", "Web site takeover", "Site Takeover",
  "Media Partner", "MEDIA PARTNER", "Media Partnership",
  "MEPCA Advertising", "Website Homescreen", "Show Review", "Show Preview",
  "12 month", "12 Month", "Section", "Advertising",
  "Website Exclusive", "YEARPLANNERS", "Yearplanner",
  "Solus eshot", "Solus e-shot", "Solus",
];

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

const recordRe =
  /^(?<pre>.+?)(?<amt>(?:£ ?)?\d[\d,]*(?:\.\d+)?)MEPCA (?<mon>[A-Za-z]{3,4})[ -](?<yy>\d{2})JTB£ ?(?<lifetime>[\d,]+?)(?<booked>\d{2}\/\d{2}\/\d{4})?£/;

const records = [];
const unparsedWithMepca = [];

// Fallback for rows whose amount cell holds text ("moved", "ignore") or is empty
const fallbackRe =
  /^(?<pre>.+?)MEPCA (?<mon>[A-Za-z]{3,4})[ -](?<yy>\d{2})JTB£ ?(?<lifetime>[\d,]+?)(?<booked>\d{2}\/\d{2}\/\d{4})?£/;

// Company/position split: find the earliest known position keyword in the text;
// everything before it is the company, the keyword plus any suffix is the position
function splitCompanyPosition(preTrimmed) {
  let best = null;
  for (const p of POSITIONS) {
    const idx = preTrimmed.indexOf(p);
    if (idx > 0 && (best === null || idx < best.idx || (idx === best.idx && p.length > best.p.length))) {
      best = { idx, p };
    }
  }
  if (!best) return null;
  return {
    company: preTrimmed.slice(0, best.idx).trim(),
    position: preTrimmed.slice(best.idx).trim(),
  };
}

let skippedCancelled = 0;
for (const line of raw.split("\n")) {
  // strip nulls/control chars the PDF extractor leaves behind (Postgres rejects them)
  const trimmed = line.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "").trim();
  if (!trimmed.includes("MEPCA") || !trimmed.includes("JTB")) continue;
  if (/cancelled|canx|canc|ignore/i.test(trimmed.split("JTB")[0])) {
    skippedCancelled++;
    continue;
  }
  let m = trimmed.match(recordRe);
  let amt;
  if (m) {
    amt = m.groups.amt.replace(/[£ ,]/g, "");
  } else {
    m = trimmed.match(fallbackRe);
    if (!m) {
      unparsedWithMepca.push(trimmed.slice(0, 120));
      continue;
    }
    amt = "0";
  }
  const { pre, mon, yy, booked, lifetime } = m.groups;

  const split = splitCompanyPosition(pre.trimEnd());
  if (!split) {
    unparsedWithMepca.push("NO-POSITION: " + trimmed.slice(0, 120));
    continue;
  }
  const { company, position } = split;

  const monthIdx = MONTHS[mon.toLowerCase()];
  if (monthIdx === undefined) continue;
  const year = 2000 + Number(yy);
  const [dd, mm, yyyy] = booked ? booked.split("/").map(Number) : [null, null, null];

  records.push({
    company,
    position,
    amount: Number(amt),
    issue: `${mon[0].toUpperCase()}${mon.slice(1).toLowerCase()} ${year}`,
    issueDate: new Date(Date.UTC(year, monthIdx, 1)),
    issueEnd: new Date(Date.UTC(year, monthIdx + 1, 0)),
    saleDate: booked ? new Date(Date.UTC(yyyy, mm - 1, dd)) : null,
    lifetime: Number(lifetime.replace(/,/g, "")),
  });
}

console.log(`parsed: ${records.length}, unparsed MEPCA lines: ${unparsedWithMepca.length}, cancelled skipped: ${skippedCancelled}`);
console.log("FM lifetime total column:", records[0]?.lifetime?.toLocaleString());
console.log("sum of parsed amounts: £" + records.reduce((s, r) => s + r.amount, 0).toLocaleString());
if (unparsedWithMepca.length) {
  console.log("--- unparsed samples:");
  for (const u of unparsedWithMepca.slice(0, 15)) console.log(u);
}

if (!dry) {
  const db = new PrismaClient();
  const now = new Date();
  let created = 0;
  let updated = 0;
  for (const r of records) {
    const fmId = `${r.company}|${r.position}|${r.issue}`.toLowerCase();
    const status = r.issueEnd < now ? "COMPLETED" : r.issueDate <= now ? "LIVE" : "UPCOMING";
    const data = {
      brand: r.company,
      package: r.position,
      value: r.amount,
      startDate: r.issueDate,
      endDate: r.issueEnd,
      status,
      saleDate: r.saleDate,
      issue: r.issue,
    };
    const existing = await db.campaign.findUnique({ where: { fileMakerId: fmId } });
    if (existing) {
      await db.campaign.update({ where: { fileMakerId: fmId }, data });
      updated++;
    } else {
      await db.campaign.create({ data: { ...data, fileMakerId: fmId } });
      created++;
    }
  }
  console.log(`imported: ${created} created, ${updated} updated`);
  await db.$disconnect();
}
