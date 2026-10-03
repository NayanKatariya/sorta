"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { MAX_DEFAULT_RECIPIENTS, MAX_SIGNATURE_CHARS } from "@/lib/send-limits";
import type { ClientState, Settings } from "@/lib/types";
import { AddressField, useAddresses } from "./compose-parts";
import { sendableAccounts } from "./compose-dialog";

/** Defaults for the composer and for AI agents: From mailbox, CC/BCC on every send, signature. Saves as it changes. */
export function SendingForm({ state, onSettings }: { state: ClientState; onSettings: (patch: Partial<Settings>) => unknown }) {
  const { settings } = state;
  const accounts = sendableAccounts(state);
  // A stored id whose mailbox was disconnected counts as "automatic".
  const from = accounts.some((a) => a.id === settings.defaultFromAccount) ? settings.defaultFromAccount! : "";
  const [signature, setSignature] = useState(settings.signature);

  // The chips live in the server state; the hook only holds what's being typed.
  const cc = useAddresses(settings.defaultCc);
  const bcc = useAddresses(settings.defaultBcc);
  const saveList = (key: "defaultCc" | "defaultBcc", field: ReturnType<typeof useAddresses>) => (
    <AddressField
      id={`default-${key}`}
      field={{
        ...field,
        setList: (next) => {
          const list = typeof next === "function" ? next(field.list) : next;
          field.setList(list);
          onSettings({ [key]: list });
        },
      }}
      label={key === "defaultCc" ? "Default Cc" : "Default Bcc"}
      placeholder="name@company.com"
      max={MAX_DEFAULT_RECIPIENTS}
    />
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <p className="text-xs text-muted-foreground">
        Used when you write a new email, and for every email an AI agent sends for you. You can still change them on each message.
      </p>

      <div className="space-y-1.5">
        <label htmlFor="default-from" className="text-sm font-medium">
          Send from
        </label>
        <select
          id="default-from"
          value={from}
          onChange={(e) => onSettings({ defaultFromAccount: e.target.value || null })}
          className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30 dark:[&>option]:bg-popover"
        >
          <option value="">First connected mailbox</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.email}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">Replies always leave from the mailbox the conversation is in.</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="default-defaultCc" className="text-sm font-medium">
          Always Cc
        </label>
        {saveList("defaultCc", cc)}
      </div>
      <div className="space-y-1.5">
        <label htmlFor="default-defaultBcc" className="text-sm font-medium">
          Always Bcc
        </label>
        {saveList("defaultBcc", bcc)}
        <p className="text-xs text-muted-foreground">Add an address and press Enter. Both lists apply to every send, including replies.</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="signature" className="flex items-baseline justify-between text-sm font-medium">
          Signature
          <span className="text-xs font-normal text-muted-foreground tabular-nums">
            {signature.length}/{MAX_SIGNATURE_CHARS}
          </span>
        </label>
        <Textarea
          id="signature"
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          onBlur={() => signature.trimEnd() !== settings.signature && onSettings({ signature })}
          maxLength={MAX_SIGNATURE_CHARS}
          rows={3}
          placeholder={"Best,\nYour name"}
        />
        <p className="text-xs text-muted-foreground">Added at the bottom after a “-- ” line. Leave empty for none.</p>
      </div>
    </div>
  );
}
