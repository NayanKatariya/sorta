import "server-only";
import { Composio } from "@composio/core";
import { open } from "./secrets";
import { readAccounts, readComposio, type Ctx } from "./store";

/** New Gmail connections made from Sorta are filed under this Composio user (in the user's own Composio project). */
export const USER_ID = process.env.COMPOSIO_USER_ID || "sift-default";

export class NotConfiguredError extends Error {
  constructor() {
    super("Add your Composio API key to connect Gmail.");
  }
}

/** One client per distinct key; each Sorta user brings their own. Bounded so it can't grow forever. */
const clients = new Map<string, Composio>();
const MAX_CLIENTS = 200;

export function clientFor(key: string) {
  let c = clients.get(key);
  if (!c) {
    if (clients.size >= MAX_CLIENTS) clients.delete(clients.keys().next().value!);
    c = new Composio({ apiKey: key });
    clients.set(key, c);
  }
  return c;
}

/** This user's Composio API key, decrypted. */
export async function apiKey(ctx: Ctx): Promise<string | null> {
  const c = await readComposio(ctx);
  if (!c) return null;
  try {
    return await open(c.apiKey);
  } catch {
    // Sealed with a different SIFT_SECRET (it was changed or lost). The key has to be entered again.
    throw new Error("Your saved Composio key can't be read any more. Paste it again under manage accounts.");
  }
}

export async function composio(ctx: Ctx) {
  const key = await apiKey(ctx);
  if (!key) throw new NotConfiguredError();
  return clientFor(key);
}

/**
 * Runs a Composio tool against one of the user's mailboxes. The account must be one of theirs:
 * its owner (the Composio user id tool calls must name) comes from their own account rows.
 */
export async function executeTool<T = unknown>(ctx: Ctx, slug: string, args: Record<string, unknown>, accountId: string, owner?: string): Promise<T> {
  const userId = owner ?? (await readAccounts(ctx)).find((a) => a.id === accountId)?.userId;
  if (!userId) throw new Error("That Gmail account isn't connected to Sorta.");
  const result = await (await composio(ctx)).tools.execute(slug, {
    userId,
    connectedAccountId: accountId,
    arguments: args,
    dangerouslySkipVersionCheck: true,
  });
  if (!result.successful) throw new Error(`${slug} failed: ${result.error ?? "unknown error"}`);
  return result.data as T;
}
