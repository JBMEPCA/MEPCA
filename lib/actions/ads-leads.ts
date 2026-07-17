"use server";

import { db } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";
import { revalidatePath } from "next/cache";
import { CATEGORIES } from "@/lib/wordpress";

const leadsPath = (magazineId: string) => `/${magazineId}/google-ads-leads`;

function termDataFrom(formData: FormData) {
  const str = (name: string) => {
    const v = formData.get(name);
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  };
  return {
    term: (str("term") ?? "").toLowerCase(),
    category: str("category"),
  };
}

export async function createTerm(magazineId: string, formData: FormData) {
  const data = termDataFrom(formData);
  if (!data.term) throw new Error("A search term is required");
  await db.monitoredTerm.upsert({
    where: { magazineId_term: { magazineId, term: data.term } },
    create: { ...data, magazineId },
    update: { category: data.category, active: true },
  });
  revalidatePath(leadsPath(magazineId));
}

export async function updateTerm(id: string, formData: FormData) {
  const data = termDataFrom(formData);
  if (!data.term) throw new Error("A search term is required");
  const updated = await db.monitoredTerm.update({ where: { id }, data });
  revalidatePath(leadsPath(updated.magazineId));
}

export async function toggleTermActive(id: string, active: boolean) {
  const updated = await db.monitoredTerm.update({ where: { id }, data: { active } });
  revalidatePath(leadsPath(updated.magazineId));
}

export async function deleteTerm(id: string) {
  const deleted = await db.monitoredTerm.delete({ where: { id } });
  revalidatePath(leadsPath(deleted.magazineId));
}

// Seed one monitored term per vetted WordPress category. The CATEGORIES list is
// MEPCA's manufacturing taxonomy, so this is only meaningful for the mepca
// title; other magazines add their terms by hand. Idempotent — re-running only
// adds categories that aren't already tracked.
export async function seedTermsFromCategories(magazineId: string) {
  let added = 0;
  for (const { name } of CATEGORIES) {
    const term = name.toLowerCase();
    const existing = await db.monitoredTerm.findUnique({
      where: { magazineId_term: { magazineId, term } },
    });
    if (existing) continue;
    await db.monitoredTerm.create({ data: { term, category: name, magazineId } });
    added++;
  }
  revalidatePath(leadsPath(magazineId));
  return { added, total: CATEGORIES.length };
}

// Fire a single on-demand search. The Sniper HQ drag-drop and the "Search now"
// button both call this; the actual search runs in the background via Inngest.
export async function requestSearchForTerm(id: string) {
  const updated = await db.monitoredTerm.update({
    where: { id },
    data: { lastResult: "Search queued…", searchStatus: "QUEUED" },
  });
  await inngest.send({ name: "ads/search.requested", data: { termId: id } });
  revalidatePath(leadsPath(updated.magazineId));
}

export async function toggleLeadGoodTarget(id: string, value: boolean) {
  const updated = await db.googleAdsLead.update({
    where: { id },
    data: { goodTarget: value },
  });
  revalidatePath(leadsPath(updated.magazineId));
}

export async function toggleLeadPitched(id: string, value: boolean) {
  const updated = await db.googleAdsLead.update({
    where: { id },
    data: { pitched: value },
  });
  revalidatePath(leadsPath(updated.magazineId));
}

// One-click handoff: turn a caught advertiser into a pipeline pitch for the same
// magazine.
export async function addLeadToPipeline(id: string) {
  const lead = await db.googleAdsLead.findUniqueOrThrow({ where: { id } });
  await db.pipelineItem.create({
    data: {
      magazineId: lead.magazineId,
      brand: lead.company,
      notes:
        `From Google Ads Leads: running ads on "${lead.searchTerm}"` +
        (lead.website ? ` (${lead.website})` : ""),
    },
  });
  await db.googleAdsLead.update({ where: { id }, data: { pitched: true } });
  revalidatePath(leadsPath(lead.magazineId));
  revalidatePath(`/${lead.magazineId}/pipeline`);
}
