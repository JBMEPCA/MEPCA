"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function toggleContentReceived(id: string, value: boolean) {
  await db.campaign.update({ where: { id }, data: { contentReceived: value } });
  revalidatePath("/content");
  revalidatePath("/");
}
