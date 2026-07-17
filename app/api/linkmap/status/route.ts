import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Latest crawl state — the tab polls this while a crawl is running
export async function GET(req: NextRequest) {
  const magazine = req.nextUrl.searchParams.get("magazine");
  if (!magazine) {
    return NextResponse.json({ error: "magazine is required" }, { status: 400 });
  }
  const crawl = await db.siteCrawl.findFirst({
    where: { magazineId: magazine },
    orderBy: { startedAt: "desc" },
  });
  return NextResponse.json(crawl);
}
