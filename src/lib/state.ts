import "server-only";
import { jevConfigured } from "./jev";
import { isLive } from "./live";
import { isSweepable, junkScore } from "./policy";
import { readStore, type Ctx } from "./store";
import type { ClientState, Store } from "./types";

export function toClientState(s: Store, userId: string): ClientState {
  const read = new Set(s.accounts.filter((a) => a.enabled).map((a) => a.id));
  const emails = Object.values(s.emails)
    .filter((e) => read.has(e.accountId))
    .map((e) => {
      const analysis = s.analysis[e.id];
      return {
        ...e,
        analysis,
        junkScore: junkScore(analysis, s.settings),
        sweepable: isSweepable(e, analysis, s.settings, s.protectedSenders),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  return {
    categories: s.categories,
    accounts: s.accounts,
    protectedSenders: s.protectedSenders,
    settings: s.settings,
    lastSweep: s.lastSweep,
    lastSyncAt: s.lastSyncAt,
    stats: s.stats,
    onboardedAt: s.onboardedAt,
    emails,
    jevConfigured: jevConfigured(),
    composio: { configured: Boolean(s.composio), hint: s.composio?.hint ?? null, live: isLive(userId) },
  };
}

export async function clientState(ctx: Ctx) {
  return toClientState(await readStore(ctx), ctx.userId);
}
