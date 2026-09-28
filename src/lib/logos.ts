import "server-only";
import { lookup, resolveTxt } from "node:dns/promises";
import { get as httpsGet } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { adminClient } from "./supabase/admin";

/**
 * Sender logos, one row per organisation (upwork.com, not each notifications.upwork.com
 * subdomain), so a platform's logo is stored once however many addresses it mails from.
 * Tries the domain's BIMI logo first (what Gmail shows next to verified brands), then its favicon.
 */
const MAX_BYTES = 512 * 1024;
/** How long a domain with no logo is left alone before trying again. */
const MISS_TTL = 7 * 24 * 3600 * 1000;

const TYPES: Record<string, string> = { svg: "image/svg+xml", png: "image/png", ico: "image/x-icon", jpg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
const EXT = Object.fromEntries(Object.entries(TYPES).map(([ext, type]) => [type, ext]));

/** Addresses a logo fetch must never reach: loopback, private, link-local (cloud metadata), CGNAT, multicast… */
const PRIVATE = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) PRIVATE.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]] as const) PRIVATE.addSubnet(net, bits, "ipv6");

/**
 * IPv6 forms that carry an IPv4 address inside (::ffff:7f00:1 is 127.0.0.1, likewise NAT64, 6to4,
 * IPv4-compatible). No brand serves a logo from one, so they're refused outright. Kept apart from
 * PRIVATE because an ipv4 check against these rules would match every IPv4 address.
 */
const EMBEDS_V4 = new BlockList();
for (const [net, bits] of [["::", 96], ["::ffff:0:0", 96], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["2002::", 16]] as const) {
  EMBEDS_V4.addSubnet(net, bits, "ipv6");
}

function isPrivate(address: string, family: number) {
  return family === 6 ? PRIVATE.check(address, "ipv6") || EMBEDS_V4.check(address, "ipv6") : PRIVATE.check(address, "ipv4");
}

/**
 * DNS lookup for the logo fetch itself: the addresses it connects to are the ones checked, so a
 * host can't answer "public" to a pre-check and "127.0.0.1" to the real connection (DNS rebinding).
 */
const publicLookup: LookupFunction = (hostname, options, callback) => {
  lookup(hostname, { all: true, family: options.family ?? 0 }).then(
    (addrs) => {
      if (!addrs.length || addrs.some((a) => isPrivate(a.address, a.family))) {
        return callback(Object.assign(new Error(`${hostname} resolves to a non-public address`), { code: "EBLOCKED" }), "", 0);
      }
      if (options.all) (callback as unknown as (e: null, a: typeof addrs) => void)(null, addrs);
      else callback(null, addrs[0].address, addrs[0].family);
    },
    (err) => callback(err, "", 0),
  );
};

type Fetched = { status: number; location?: string; type: string; body: Buffer | null };

/** One HTTPS GET through publicLookup, body capped at MAX_BYTES, whole request capped at 6s. */
function fetchOnce(u: URL): Promise<Fetched | null> {
  return new Promise((resolve) => {
    const req = httpsGet(u, { lookup: publicLookup, headers: { "user-agent": "Sorta-logo-fetcher" } }, (res) => {
      const status = res.statusCode ?? 0;
      const type = String(res.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
      if (status !== 200) {
        res.resume();
        return resolve({ status, location: res.headers.location, type, body: null });
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > MAX_BYTES) {
          req.destroy();
          resolve(null);
        } else chunks.push(c);
      });
      res.on("end", () => resolve({ status, type, body: Buffer.concat(chunks) }));
      res.on("error", () => resolve(null));
    });
    const timer = setTimeout(() => req.destroy(), 6000);
    req.on("close", () => clearTimeout(timer));
    req.on("error", () => resolve(null));
  });
}

/** HTTPS only, public addresses only (checked at connect time), redirects re-checked hop by hop. */
async function download(url: string, accept: (type: string) => boolean): Promise<{ body: Buffer; type: string } | null> {
  for (let hop = 0; hop < 4; hop++) {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return null;
    }
    if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null;
    // IP literals skip DNS, so publicLookup never sees them; check them here.
    const literal = u.hostname.replace(/^\[|\]$/g, "");
    if (isIP(literal) && isPrivate(literal, isIP(literal))) return null;

    const res = await fetchOnce(u);
    if (!res) return null;
    if (res.status >= 300 && res.status < 400 && res.location) {
      url = new URL(res.location, u).toString();
      continue;
    }
    if (res.status !== 200 || !res.body?.length || !accept(res.type) || !EXT[res.type]) return null;
    return { body: res.body, type: res.type };
  }
  return null;
}

/** BIMI: a TXT record at default._bimi.<domain> like "v=BIMI1; l=https://…/logo.svg". */
async function bimi(domain: string) {
  const records = await resolveTxt(`default._bimi.${domain}`).catch(() => []);
  const url = records.map((r) => r.join("")).join(";").match(/\bl=([^;\s]+)/)?.[1];
  return url ? download(url, (t) => t === "image/svg+xml") : null;
}

async function favicon(domain: string) {
  // Google's favicon service returns 404 (with a generic globe) when the site has no icon.
  return download(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`, (t) => t.startsWith("image/"));
}

type Logo = { body: Buffer; type: string };

/** The stored logo, `null` for a recent miss, or `undefined` when it's worth (re)trying. */
async function cached(domain: string): Promise<Logo | null | undefined> {
  const { data } = await adminClient().from("logos").select("content_type, body_b64, missed_at").eq("domain", domain).maybeSingle();
  if (!data) return undefined;
  if (data.body_b64 && data.content_type) return { body: Buffer.from(data.body_b64, "base64"), type: data.content_type };
  return data.missed_at && Date.now() - new Date(data.missed_at).getTime() < MISS_TTL ? null : undefined;
}

async function remember(domain: string, logo: Logo | null) {
  const now = new Date().toISOString();
  await adminClient()
    .from("logos")
    .upsert({
      domain,
      content_type: logo?.type ?? null,
      body_b64: logo ? logo.body.toString("base64") : null,
      missed_at: logo ? null : now,
      updated_at: now,
    });
}

const inflight = new Map<string, Promise<Logo | null>>();

/** The logo for an organisation domain, fetched at most once and then served from the database. */
export function getLogo(domain: string) {
  let p = inflight.get(domain);
  if (!p) {
    p = (async () => {
      const hit = await cached(domain);
      if (hit !== undefined) return hit;
      const logo = (await bimi(domain)) ?? (await favicon(domain));
      await remember(domain, logo);
      return logo;
    })().finally(() => inflight.delete(domain));
    inflight.set(domain, p);
  }
  return p;
}
