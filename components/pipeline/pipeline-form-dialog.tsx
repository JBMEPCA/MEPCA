"use client";

import { useState } from "react";
import { createPipelineItem, updatePipelineItem } from "@/lib/actions/pipeline";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { STAGE_OPTIONS } from "@/lib/pipeline-stages";

export type PipelineFormValues = {
  id?: string;
  brand?: string;
  package?: string;
  estimatedValue?: string;
  stage?: string;
  followUpDate?: string;
  salesperson?: string;
  notes?: string;
};

export function PipelineFormDialog({
  magazine,
  item,
  trigger,
}: {
  magazine: string;
  item?: PipelineFormValues;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const editing = Boolean(item?.id);

  async function handleSubmit(formData: FormData) {
    setSaving(true);
    try {
      if (editing) {
        await updatePipelineItem(item!.id!, formData);
      } else {
        await createPipelineItem(magazine, formData);
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
          <DialogTitle>{editing ? "Edit pitch" : "New pitch"}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="brand">Brand *</Label>
              <Input id="brand" name="brand" defaultValue={item?.brand} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="package">Package pitched</Label>
              <Input id="package" name="package" defaultValue={item?.package} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="estimatedValue">Estimated value (£)</Label>
              <Input id="estimatedValue" name="estimatedValue" type="number" step="0.01" min="0"
                defaultValue={item?.estimatedValue} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="stage">Stage</Label>
              <select
                id="stage" name="stage" defaultValue={item?.stage ?? "PITCHED"}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
              >
                {STAGE_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="followUpDate">Follow up on</Label>
              <Input id="followUpDate" name="followUpDate" type="date"
                defaultValue={item?.followUpDate} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="salesperson">Sales person</Label>
              <Input id="salesperson" name="salesperson" defaultValue={item?.salesperson} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" defaultValue={item?.notes} rows={3} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Add pitch"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
