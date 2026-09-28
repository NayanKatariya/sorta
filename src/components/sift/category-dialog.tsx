"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Category } from "@/lib/types";

const TEMPLATES = [
  { name: "Work", description: "Messages from colleagues, clients, recruiters replying to me, meetings and project discussion." },
  { name: "Finance", description: "Bank statements, credit card bills, UPI or payment receipts, investments, taxes and insurance." },
  { name: "Job hunt", description: "Job alerts, applications I sent, interview invitations and recruiter outreach." },
  { name: "Shopping", description: "Order confirmations, shipping and delivery updates, returns and refunds for things I bought." },
  { name: "Travel", description: "Flight, train, hotel and cab bookings, itineraries, check-in reminders and boarding passes." },
  { name: "Learning", description: "Courses, tutorials, certifications and educational content I signed up for." },
  { name: "Dev & tools", description: "GitHub, CI, cloud providers, API keys, developer tool accounts and product changelogs." },
  { name: "Security", description: "Sign-in alerts, one-time codes, password resets and account security warnings." },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Partial<Category> | null;
  existing: Category[];
  busy: boolean;
  onSave: (name: string, description: string) => Promise<unknown>;
};

export function CategoryDialog({ open, onOpenChange, initial, existing, busy, onSave }: Props) {
  // Mounted fresh each time it opens, so props seed the form directly.
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const editing = Boolean(initial?.id);

  const taken = new Set(existing.map((c) => c.name.toLowerCase()));
  const templates = TEMPLATES.filter((t) => !taken.has(t.name.toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit category" : "New category"}</DialogTitle>
          <DialogDescription>
            Describe the emails that belong here in plain English. Jev uses the description to sort your inbox, so being specific helps.
          </DialogDescription>
        </DialogHeader>

        {!editing && templates.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {templates.map((t) => (
              <button
                key={t.name}
                type="button"
                onClick={() => {
                  setName(t.name);
                  setDescription(t.description);
                }}
                className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                + {t.name}
              </button>
            ))}
          </div>
        )}

        <form
          id="category-form"
          className="space-y-3"
          onSubmit={async (ev) => {
            ev.preventDefault();
            const r = await onSave(name, description);
            if (r) onOpenChange(false);
          }}
        >
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Side projects…" name="category-name" autoComplete="off" autoFocus required />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">What belongs here?</span>
            <span className="block text-xs text-muted-foreground">Jev reads this to decide. Mention senders, topics, or what to leave out.</span>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              name="category-description"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
              }}
              placeholder="e.g. Emails about my open-source projects: GitHub issues, PR reviews, sponsor messages…"
            />
          </label>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="category-form" disabled={busy || !name.trim()}>
            {busy && <Loader2 className="animate-spin" />}
            {busy ? "Saving…" : editing ? "Save & re-sort" : "Create & sort"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
