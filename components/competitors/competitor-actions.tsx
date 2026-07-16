"use client";

import { useRef, useState } from "react";
import {
  importCompetitorSheet, toggleGoodTarget, togglePitched, addToPipeline,
} from "@/lib/actions/competitors";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export function CompetitorSheetUpload({ magazine }: { magazine: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const r = await importCompetitorSheet(magazine, formData);
      setResult(`Synced ${r.imported} advertisers${r.skipped ? ` (${r.skipped} rows skipped)` : ""}`);
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
        accept=".xlsx"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      <Button disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? "Syncing…" : "Sync spreadsheet"}
      </Button>
      {result && <span className="text-sm text-muted-foreground">{result}</span>}
    </div>
  );
}

export function GoodTargetCheckbox({ id, checked }: { id: string; checked: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <Checkbox
      checked={checked}
      disabled={busy}
      onCheckedChange={async (value) => {
        setBusy(true);
        try {
          await toggleGoodTarget(id, value === true);
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

export function PitchedCheckbox({ id, checked }: { id: string; checked: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <Checkbox
      checked={checked}
      disabled={busy}
      onCheckedChange={async (value) => {
        setBusy(true);
        try {
          await togglePitched(id, value === true);
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

export function AddToPipelineButton({ id, brand }: { id: string; brand: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={async () => {
        if (confirm(`Add ${brand} to the pipeline as a new pitch?`)) {
          setBusy(true);
          try {
            await addToPipeline(id);
          } finally {
            setBusy(false);
          }
        }
      }}
    >
      {busy ? "Adding…" : "→ Pipeline"}
    </Button>
  );
}
