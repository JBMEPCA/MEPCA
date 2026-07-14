"use client";

import { useState } from "react";
import { toggleContentReceived } from "@/lib/actions/content";
import { Checkbox } from "@/components/ui/checkbox";

export function ReceivedCheckbox({ id, checked }: { id: string; checked: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <Checkbox
      checked={checked}
      disabled={busy}
      onCheckedChange={async (value) => {
        setBusy(true);
        try {
          await toggleContentReceived(id, value === true);
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}
