import { NextResponse } from "next/server";
import { syncLedgerPdf } from "@/lib/fm-ledger";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // year ledgers take a while to swap month-by-month

// Upload a FileMaker sales-ledger PDF; every issue-month in the file is
// replaced with the file's rows.
export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (!/\.pdf$/i.test(file.name)) {
    return NextResponse.json(
      { error: "That's not a PDF — export the sales ledger from FileMaker as PDF." },
      { status: 400 }
    );
  }
  try {
    const result = await syncLedgerPdf(Buffer.from(await file.arrayBuffer()));
    return NextResponse.json(result, { status: result.error ? 400 : 200 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Import failed" },
      { status: 500 }
    );
  }
}
