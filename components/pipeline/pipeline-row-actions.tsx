"use client";

import { convertToCampaign, deletePipelineItem } from "@/lib/actions/pipeline";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export function ConvertButton({ id, brand }: { id: string; brand: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={async () => {
        if (confirm(`Mark ${brand} as signed off and create a campaign from it?`)) {
          setBusy(true);
          try {
            await convertToCampaign(id);
          } finally {
            setBusy(false);
          }
        }
      }}
    >
      {busy ? "Converting…" : "Won → Campaign"}
    </Button>
  );
}

export function DeletePipelineButton({ id, brand }: { id: string; brand: string }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-red-600 hover:text-red-700"
      onClick={() => {
        if (confirm(`Delete the ${brand} pitch? This can't be undone.`)) {
          deletePipelineItem(id);
        }
      }}
    >
      Delete
    </Button>
  );
}
