"use client";

import { useState } from "react";
import {
  createTerm, updateTerm, toggleTermActive, deleteTerm, requestSearchForTerm,
  toggleLeadGoodTarget, toggleLeadPitched, addLeadToPipeline, seedTermsFromCategories,
} from "@/lib/actions/ads-leads";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export type TermFormValues = {
  id?: string;
  term?: string;
  category?: string | null;
};

export function TermFormDialog({
  magazine,
  term,
  trigger,
}: {
  magazine: string;
  term?: TermFormValues;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const editing = Boolean(term?.id);

  async function handleSubmit(formData: FormData) {
    setSaving(true);
    try {
      if (editing) {
        await updateTerm(term!.id!, formData);
      } else {
        await createTerm(magazine, formData);
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
          <DialogTitle>{editing ? "Edit search term" : "Monitor a new term"}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="term">Google search term *</Label>
            <Input id="term" name="term" placeholder="e.g. manufacturing software"
              defaultValue={term?.term} required />
            <p className="text-xs text-muted-foreground">
              The Sniper googles this UK-targeted and logs every company running ads on it.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="category">Category (optional)</Label>
            <Input id="category" name="category" placeholder="e.g. Manufacturing Software"
              defaultValue={term?.category ?? ""} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Add term"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SeedFromCategoriesButton({ magazine }: { magazine: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setResult(null);
          try {
            const r = await seedTermsFromCategories(magazine);
            setResult(
              r.added > 0
                ? `Added ${r.added} term${r.added === 1 ? "" : "s"} from your categories`
                : "All categories already monitored"
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Seeding…" : "Seed from WordPress categories"}
      </Button>
      {result && <span className="text-sm text-muted-foreground">{result}</span>}
    </div>
  );
}

export function SearchNowButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await requestSearchForTerm(id);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Queuing…" : "Search now"}
    </Button>
  );
}

export function ActiveTermCheckbox({ id, checked }: { id: string; checked: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <Checkbox
      checked={checked}
      disabled={busy}
      onCheckedChange={async (value) => {
        setBusy(true);
        try {
          await toggleTermActive(id, value === true);
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

export function DeleteTermButton({ id, term }: { id: string; term: string }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-red-400 hover:text-red-300"
      onClick={() => {
        if (confirm(`Stop monitoring "${term}"? Its logged leads will also be removed.`)) {
          deleteTerm(id);
        }
      }}
    >
      Delete
    </Button>
  );
}

export function LeadGoodTargetCheckbox({ id, checked }: { id: string; checked: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <Checkbox
      checked={checked}
      disabled={busy}
      onCheckedChange={async (value) => {
        setBusy(true);
        try {
          await toggleLeadGoodTarget(id, value === true);
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

export function LeadPitchedCheckbox({ id, checked }: { id: string; checked: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <Checkbox
      checked={checked}
      disabled={busy}
      onCheckedChange={async (value) => {
        setBusy(true);
        try {
          await toggleLeadPitched(id, value === true);
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

export function AddLeadToPipelineButton({ id, company }: { id: string; company: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={async () => {
        if (confirm(`Add ${company} to the pipeline as a new pitch?`)) {
          setBusy(true);
          try {
            await addLeadToPipeline(id);
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
