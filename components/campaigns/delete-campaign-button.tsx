"use client";

import { deleteCampaign } from "@/lib/actions/campaigns";
import { Button } from "@/components/ui/button";

export function DeleteCampaignButton({ id, brand }: { id: string; brand: string }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-red-400 hover:text-red-300"
      onClick={() => {
        if (confirm(`Delete the ${brand} campaign? This can't be undone.`)) {
          deleteCampaign(id);
        }
      }}
    >
      Delete
    </Button>
  );
}
