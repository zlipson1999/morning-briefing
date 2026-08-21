import crypto from "node:crypto";

/**
 * Authenticated encryption for the small amount of state that has to survive
 * a request — an E*TRADE token — without a database.
 *
 * The old design kept tokens in a module-level Map. That works on exactly one
 * long-lived process: on any host that runs more than one instance, or that
 * recycles them between requests, a connected session vanished at random and
 * the panel blamed E*TRADE. A sealed cookie has neither problem, and the
 * ciphertext is useless to whoever holds it.
 *
 * AES-256-GCM, so a tampered cookie fails to open rather than decrypting into
 * something attacker-chosen. The value is httpOnly either way: browser
 * JavaScript never sees it.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

let cachedKey: Buffer | null = null;
let derivedFromEnv = false;

function key(): Buffer {
  if (cachedKey) return cachedKey;

  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 16) {
    cachedKey = crypto.createHash("sha256").update(secret).digest();
    derivedFromEnv = true;
  } else {
    // No secret configured: fall back to a per-process key. Everything still
    // works, sessions just don't outlive a restart — exactly the old
    // behaviour, now opt-out rather than unavoidable.
    cachedKey = crypto.randomBytes(32);
    derivedFromEnv = false;
    console.warn(
      "[etrade] SESSION_SECRET is not set — E*TRADE connections won't survive a " +
        "server restart or a second instance. Set one in .env.local.",
    );
  }
  return cachedKey;
}

/** True when sealed values can outlive this process. Surfaced in the UI. */
export function sealingIsDurable(): boolean {
  key();
  return derivedFromEnv;
}

export function seal(payload: unknown): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key(), iv);
  const body = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

/** Returns null for anything that isn't ours: absent, malformed or tampered. */
export function unseal<T>(sealed: string | undefined | null): T | null {
  if (!sealed) return null;
  try {
    const raw = Buffer.from(sealed, "base64url");
    if (raw.length <= IV_BYTES + TAG_BYTES) return null;

    const decipher = crypto.createDecipheriv(ALGORITHM, key(), raw.subarray(0, IV_BYTES));
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));

    const plain = Buffer.concat([
      decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString("utf8");

    return JSON.parse(plain) as T;
  } catch {
    return null;
  }
}

/** Test seam: drop the cached key so a test can set SESSION_SECRET first. */
export function resetSealingKey() {
  cachedKey = null;
  derivedFromEnv = false;
}
