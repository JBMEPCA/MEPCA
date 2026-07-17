"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type SyncResult = {
  months?: { issue: string; rows: number; total: number; deleted: number }[];
  skipped?: { cancelled: number; miele: number; unknownIssues: string[] };
  error?: string;
};

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency", currency: "GBP", maximumFractionDigits: 0,
});

// "Update from FileMaker": upload the sales-ledger PDF (a whole issue year or
// a single month) and every month in it is refreshed — safe to repeat.
export function FmSyncButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch("/api/fm-sync", { method: "POST", body: formData });
      const data: SyncResult = await res.json();
      if (data.error) {
        setResult(data.error);
        return;
      }
      const months = data.months ?? [];
      const grand = months.reduce((s, m) => s + m.total, 0);
      let msg = `Updated ${months.length} issue month${months.length === 1 ? "" : "s"} — ${gbp.format(grand)}`;
      if (months.length <= 4) {
        msg += `: ${months.map((m) => `${m.issue} ${gbp.format(m.total)}`).join(", ")}`;
      }
      if (data.skipped?.unknownIssues?.length) {
        msg += `. Couldn't place: ${data.skipped.unknownIssues.slice(0, 3).join("; ")}`;
      }
      setResult(msg);
      router.refresh(); // charts and tiles pick up the new numbers
    } catch {
      setResult("Upload failed — try again, or send the file to the hub chat.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3">
      {result && (
        <span className="max-w-md text-right text-xs text-muted-foreground">{result}</span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      <Button variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? "Updating…" : "Update from FileMaker"}
      </Button>
    </div>
  );
}
