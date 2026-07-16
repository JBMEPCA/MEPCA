import { db } from "@/lib/db";
import type { MonitoredTerm } from "@prisma/client";
import { searchGoogleAds, type SerperAd } from "@/lib/serper";

// The Sniper's job: for one monitored term, search UK Google, read who's paying
// for ads on it, and log each advertiser as a prospective MEPCA lead.
// Mirrors lib/scanner.ts (the competitor-intel spy), but the "source" is a
// Google search term rather than a competitor magazine.

function dedupeKeyFor(company: string, term: string) {
  return [company, term].map((s) => s.toLowerCase().trim()).join("|");
}

async function upsertLeads(ads: SerperAd[], term: MonitoredTerm) {
  const now = new Date();
  let count = 0;
  for (const ad of ads) {
    const company = ad.company?.trim();
    if (!company) continue;
    const key = dedupeKeyFor(company, term.term);
    await db.googleAdsLead.upsert({
      where: { magazineId_dedupeKey: { magazineId: term.magazineId, dedupeKey: key } },
      create: {
        magazineId: term.magazineId,
        company,
        website: ad.website,
        adHeadline: ad.headline,
        adDescription: ad.description,
        termId: term.id,
        searchTerm: term.term,
        dedupeKey: key,
        firstSeenAt: now,
        lastSeenAt: now,
      },
      update: {
        // refresh the ad copy/website (they change) and bump the sighting count
        website: ad.website,
        adHeadline: ad.headline,
        adDescription: ad.description,
        lastSeenAt: now,
        timesSeen: { increment: 1 },
      },
    });
    count++;
  }
  return count;
}

// Search one term end-to-end and record the outcome on the term row.
export async function searchTermForAds(term: MonitoredTerm) {
  const ads = await searchGoogleAds(term.term);
  const upserted = await upsertLeads(ads, term);

  const result =
    ads.length === 0
      ? "No advertisers found on this term"
      : `Found ${upserted} advertiser${upserted === 1 ? "" : "s"} running ads`;

  await db.monitoredTerm.update({
    where: { id: term.id },
    data: { lastCheckedAt: new Date(), lastResult: result },
  });
  return result;
}

// Wrapper that flips the live status flag so the Sniper HQ animation can track
// which term is being worked, and always clears it afterwards.
export async function runTermSearch(term: MonitoredTerm) {
  await db.monitoredTerm.update({
    where: { id: term.id },
    data: { searchStatus: "SEARCHING" },
  });
  try {
    return await searchTermForAds(term);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Search failed";
    await db.monitoredTerm.update({
      where: { id: term.id },
      data: { lastCheckedAt: new Date(), lastResult: `Error: ${msg}` },
    });
    return `Error: ${msg}`;
  } finally {
    await db.monitoredTerm.update({
      where: { id: term.id },
      data: { searchStatus: "IDLE" },
    });
  }
}
