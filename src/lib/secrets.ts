import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

let key: Buffer | undefined;

/**
 * The AES-256 key secrets are sealed with, derived from SIFT_SECRET. It has to be set (and kept):
 * losing or changing it means every user re-enters their Composio key.
 */
function masterKey() {
  if (key) return key;
  const secret = process.env.SIFT_SECRET;
  if (!secret || secret.length < 32) throw new Error("Set SIFT_SECRET to a random string of at least 32 characters (openssl rand -base64 48).");
  key = createHash("sha256").update(secret).digest();
  return key;
}

/** AES-256-GCM, stored as `v1.<iv>.<tag>.<ciphertext>` (base64url). */
export async function seal(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export async function open(sealed: string) {
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Unrecognised secret format");
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
