import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Polled by the Sniper HQ so the sniper animation tracks real search activity
export async function GET(request: Request) {
  const magazine = new URL(request.url).searchParams.get("magazine");
  const terms = await db.monitoredTerm.findMany({
    where: magazine ? { magazineId: magazine } : undefined,
    orderBy: { term: "asc" },
    select: {
      id: true,
      term: true,
      category: true,
      active: true,
      searchStatus: true,
      lastCheckedAt: true,
      lastResult: true,
    },
  });
  return NextResponse.json({ terms });
}
