"use server";

import { db } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";
import { revalidatePath } from "next/cache";
import type { SourceType } from "@prisma/client";

function sourceDataFrom(formData: FormData) {
  const str = (name: string) => {
    const v = formData.get(name);
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  };
  return {
    name: str("name") ?? "",
    type: (str("type") ?? "WEBSITE") as SourceType,
    url: str("url") ?? "",
  };
}

const intelPath = (magazineId: string) => `/${magazineId}/competitor-intel`;

export async function createSource(magazineId: string, formData: FormData) {
  const data = sourceDataFrom(formData);
  if (!data.name || !data.url) throw new Error("Name and URL are required");
  await db.watchedSource.create({ data: { ...data, magazineId } });
  revalidatePath(intelPath(magazineId));
}

export async function updateSource(id: string, formData: FormData) {
  const data = sourceDataFrom(formData);
  if (!data.name || !data.url) throw new Error("Name and URL are required");
  const updated = await db.watchedSource.update({ where: { id }, data });
  revalidatePath(intelPath(updated.magazineId));
}

export async function toggleSourceActive(id: string, active: boolean) {
  const updated = await db.watchedSource.update({ where: { id }, data: { active } });
  revalidatePath(intelPath(updated.magazineId));
}

export async function deleteSource(id: string) {
  const deleted = await db.watchedSource.delete({ where: { id } });
  revalidatePath(intelPath(deleted.magazineId));
}

// Fires the Inngest event; the scan runs in the background and the page
// shows the result under "Last result" once it finishes
export async function requestScan(id: string) {
  const updated = await db.watchedSource.update({
    where: { id },
    data: { lastResult: "Scan queued…", scanStatus: "QUEUED" },
  });
  await inngest.send({ name: "sources/scan.requested", data: { sourceId: id } });
  revalidatePath(intelPath(updated.magazineId));
}

// Agent HQ drag-drop: scan every source belonging to one competitor title
export async function requestScanForTitle(magazineId: string, name: string) {
  const sources = await db.watchedSource.findMany({
    where: { magazineId, name, active: true },
  });
  for (const source of sources) {
    await db.watchedSource.update({
      where: { id: source.id },
      data: { lastResult: "Scan queued…", scanStatus: "QUEUED" },
    });
    await inngest.send({
      name: "sources/scan.requested",
      data: { sourceId: source.id },
    });
  }
  revalidatePath(intelPath(magazineId));
}

export async function dismissAlert(id: string) {
  const alert = await db.sourceAlert.update({
    where: { id },
    data: { dismissed: true },
    include: { source: { select: { magazineId: true } } },
  });
  revalidatePath(intelPath(alert.source.magazineId));
}
