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
    notes: str("notes"),
  };
}

export async function createPipelineItem(formData: FormData) {
  const data = pipelineDataFrom(formData);
  if (!data.brand) throw new Error("Brand is required");
  await db.pipelineItem.create({ data });
  revalidatePath("/pipeline");
}

export async function updatePipelineItem(id: string, formData: FormData) {
  const data = pipelineDataFrom(formData);
  if (!data.brand) throw new Error("Brand is required");
  await db.pipelineItem.update({ where: { id }, data });
  revalidatePath("/pipeline");
}

export async function deletePipelineItem(id: string) {
  await db.pipelineItem.delete({ where: { id } });
  revalidatePath("/pipeline");
}

// Won the pitch: create a Campaign from the pipeline item and mark it signed off
export async function convertToCampaign(id: string) {
  const item = await db.pipelineItem.findUniqueOrThrow({ where: { id } });
  const campaign = await db.campaign.create({
    data: {
      brand: item.brand,
      package: item.package ?? "",
      value: item.estimatedValue,
      status: "UPCOMING",
      notes: item.notes,
    },
  });
  await db.pipelineItem.update({
    where: { id },
    data: { stage: "SIGNED_OFF", convertedCampaignId: campaign.id },
  });
  revalidatePath("/pipeline");
  revalidatePath("/campaigns");
}
