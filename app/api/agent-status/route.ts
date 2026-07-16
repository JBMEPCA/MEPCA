import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Polled by Agent HQ so the spy animation tracks real scan activity
export async function GET(request: Request) {
  const magazine = new URL(request.url).searchParams.get("magazine");
  const sources = await db.watchedSource.findMany({
    where: magazine ? { magazineId: magazine } : undefined,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      type: true,
      url: true,
      active: true,
      scanStatus: true,
      lastCheckedAt: true,
      lastResult: true,
    },
  });
  return NextResponse.json({ sources });
}
