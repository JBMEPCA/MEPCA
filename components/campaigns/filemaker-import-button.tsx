"use client";

import { useRef, useState } from "react";
import { importFileMakerCsv } from "@/lib/actions/filemaker";
import { Button } from "@/components/ui/button";

export function FileMakerImportButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const r = await importFileMakerCsv(formData);
      let msg = `Imported: ${r.created} new, ${r.updated} updated`;
      if (r.skipped) msg += `, ${r.skipped} skipped (no brand)`;
      if (r.unmappedHeaders.length) msg += `. Columns not recognised: ${r.unmappedHeaders.join(", ")}`;
      setResult(msg);
    } catch (e) {
      setResult(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      <Button variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? "Importing…" : "Import FileMaker CSV"}
      </Button>
      {result && <span className="text-sm text-muted-foreground">{result}</span>}
    </div>
  );
}
