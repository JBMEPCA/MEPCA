"use client";

import { useState } from "react";
import {
  createSource, updateSource, toggleSourceActive, deleteSource, requestScan, dismissAlert,
} from "@/lib/actions/sources";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

import { TYPE_OPTIONS } from "@/lib/source-types";

export type SourceFormValues = {
  id?: string;
  name?: string;
  type?: string;
  url?: string;
};

export function SourceFormDialog({
  source,
  trigger,
}: {
  source?: SourceFormValues;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const editing = Boolean(source?.id);

  async function handleSubmit(formData: FormData) {
    setSaving(true);
    try {
      if (editing) {
        await updateSource(source!.id!, formData);
      } else {
        await createSource(formData);
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
          <DialogTitle>{editing ? "Edit source" : "Watch a new source"}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Competitor title *</Label>
            <Input id="name" name="name" placeholder="e.g. Warehouse & Logistics News"
              defaultValue={source?.name} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="type">What to watch</Label>
            <select
              id="type" name="type" defaultValue={source?.type ?? "WEBSITE"}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="url">URL *</Label>
            <Input id="url" name="url" type="url" defaultValue={source?.url}
              placeholder="Homepage for websites, archive/issues page for magazines" required />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Add source"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CheckNowButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await requestScan(id);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Queuing…" : "Check now"}
    </Button>
  );
}

export function ActiveCheckbox({ id, checked }: { id: string; checked: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <Checkbox
      checked={checked}
      disabled={busy}
      onCheckedChange={async (value) => {
        setBusy(true);
        try {
          await toggleSourceActive(id, value === true);
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

export function DeleteSourceButton({ id, name }: { id: string; name: string }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-red-400 hover:text-red-300"
      onClick={() => {
        if (confirm(`Stop watching ${name}? Its alerts will also be removed.`)) {
          deleteSource(id);
        }
      }}
    >
      Delete
    </Button>
  );
}

export function DismissAlertButton({ id }: { id: string }) {
  return (
    <Button variant="ghost" size="sm" onClick={() => dismissAlert(id)}>
      Dismiss
    </Button>
  );
}
