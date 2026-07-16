"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import type { PipelineStage } from "@prisma/client";

function pipelineDataFrom(formData: FormData) {
  const str = (name: string) => {
    const v = formData.get(name);
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  };
  return {
    brand: str("brand") ?? "",
    package: str("package"),
    estimatedValue: str("estimatedValue"),
    stage: (str("stage") ?? "PITCHED") as PipelineStage,
    followUpDate: str("followUpDate") ? new Date(str("followUpDate")!) : null,
    salesperson: str("salesperson"),
    notes: str("notes"),
  };
}

export async function createPipelineItem(magazineId: string, formData: FormData) {
  const data = pipelineDataFrom(formData);
  if (!data.brand) throw new Error("Brand is required");
  await db.pipelineItem.create({ data: { ...data, magazineId } });
  revalidatePath(`/${magazineId}/pipeline`);
}

export async function updatePipelineItem(id: string, formData: FormData) {
  const data = pipelineDataFrom(formData);
  if (!data.brand) throw new Error("Brand is required");
  const updated = await db.pipelineItem.update({ where: { id }, data });
  revalidatePath(`/${updated.magazineId}/pipeline`);
}

export async function deletePipelineItem(id: string) {
  const deleted = await db.pipelineItem.delete({ where: { id } });
  revalidatePath(`/${deleted.magazineId}/pipeline`);
}

// Won the pitch: create a Campaign from the pipeline item and mark it signed off
export async function convertToCampaign(id: string) {
  const item = await db.pipelineItem.findUniqueOrThrow({ where: { id } });
  const campaign = await db.campaign.create({
    data: {
      magazineId: item.magazineId,
      brand: item.brand,
      package: item.package ?? "",
      value: item.estimatedValue,
      status: "UPCOMING",
      salesperson: item.salesperson,
      notes: item.notes,
    },
  });
  await db.pipelineItem.update({
    where: { id },
    data: { stage: "SIGNED_OFF", convertedCampaignId: campaign.id },
  });
  revalidatePath(`/${item.magazineId}/pipeline`);
  revalidatePath(`/${item.magazineId}/campaigns`);
}
