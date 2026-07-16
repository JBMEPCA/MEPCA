"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import type { CampaignStatus } from "@prisma/client";

function campaignDataFrom(formData: FormData) {
  const str = (name: string) => {
    const v = formData.get(name);
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  };
  return {
    brand: str("brand") ?? "",
    package: str("package") ?? "",
    value: str("value"),
    startDate: str("startDate") ? new Date(str("startDate")!) : null,
    endDate: str("endDate") ? new Date(str("endDate")!) : null,
    status: (str("status") ?? "UPCOMING") as CampaignStatus,
    salesperson: str("salesperson"),
    notes: str("notes"),
  };
}

export async function createCampaign(magazineId: string, formData: FormData) {
  const data = campaignDataFrom(formData);
  if (!data.brand || !data.package) throw new Error("Brand and package are required");
  await db.campaign.create({ data: { ...data, magazineId } });
  revalidatePath(`/${magazineId}/campaigns`);
}

export async function updateCampaign(id: string, formData: FormData) {
  const data = campaignDataFrom(formData);
  if (!data.brand || !data.package) throw new Error("Brand and package are required");
  const updated = await db.campaign.update({ where: { id }, data });
  revalidatePath(`/${updated.magazineId}/campaigns`);
}

export async function deleteCampaign(id: string) {
  const deleted = await db.campaign.delete({ where: { id } });
  revalidatePath(`/${deleted.magazineId}/campaigns`);
}
