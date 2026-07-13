"use client";

import { useState } from "react";
import { createCampaign, updateCampaign } from "@/lib/actions/campaigns";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type CampaignFormValues = {
  id?: string;
  brand?: string;
  package?: string;
  value?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  notes?: string;
};

export function CampaignFormDialog({
  campaign,
  trigger,
}: {
  campaign?: CampaignFormValues;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const editing = Boolean(campaign?.id);

  async function handleSubmit(formData: FormData) {
    setSaving(true);
    try {
      if (editing) {
        await updateCampaign(campaign!.id!, formData);
      } else {
        await createCampaign(formData);
      }
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit campaign" : "New campaign"}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="brand">Brand *</Label>
              <Input id="brand" name="brand" defaultValue={campaign?.brand} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="package">Package / spec *</Label>
              <Input id="package" name="package" defaultValue={campaign?.package} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="value">Value (£)</Label>
              <Input id="value" name="value" type="number" step="0.01" min="0"
                defaultValue={campaign?.value} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status">Status</Label>
              <select
                id="status" name="status" defaultValue={campaign?.status ?? "UPCOMING"}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
              >
                <option value="UPCOMING">Upcoming</option>
                <option value="LIVE">Live</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="startDate">Start date</Label>
              <Input id="startDate" name="startDate" type="date" defaultValue={campaign?.startDate} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="endDate">End date</Label>
              <Input id="endDate" name="endDate" type="date" defaultValue={campaign?.endDate} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" defaultValue={campaign?.notes} rows={3} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Add campaign"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
