import { NextRequest, NextResponse } from "next/server";
import { getGraph } from "@/lib/linkmap";

// Node + link payload for the 3D map. ~3,000 nodes serialises to a few MB,
// so the client fetches it rather than it being server-rendered as props.
export async function GET(req: NextRequest) {
  const magazine = req.nextUrl.searchParams.get("magazine");
  if (!magazine) {
    return NextResponse.json({ error: "magazine is required" }, { status: 400 });
  }
  const graph = await getGraph(magazine);
  return NextResponse.json(graph);
}
