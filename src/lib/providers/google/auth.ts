import fs from "node:fs/promises";
import path from "node:path";
import { seal, unseal } from "@/lib/seal";
import { fetchWithTimeout } from "@/lib/cache";

/**
 * Direct Google access — no Zapier, no funnel, no middleman.
 *
 * You create one OAuth client in Google's console (README walks it through),
 * consent once in the browser, and Miles polls Calendar, Gmail and Tasks
 * itself. The refresh token is the only thing kept: sealed with AES-256-GCM
 * under SESSION_SECRET and written to disk, so it survives restarts, never
 * leaves this machine, and is ciphertext if anything else reads the file.
 *
 * Everything is read-only by scope. Miles can see your day; it cannot send
 * mail, edit events or complete tasks, because it never asked to.
 */

export const GOOGLE_STATE_COOKIE = "mb_google_state";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/tasks.readonly",
].join(" ");

export function googleCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

const storePath = () =>
  process.env.GOOGLE_STORE || path.join(process.cwd(), ".data", "google.json");

type StoredGrant = { refreshToken: string; grantedAt: number };

export async function saveRefreshToken(refreshToken: string): Promise<void> {
  const target = storePath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  const sealed = seal({ refreshToken, grantedAt: Date.now() } satisfies StoredGrant);
  const temp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify({ sealed }), "utf8");
  await fs.rename(temp, target);
  accessCache = null;
}

export async function readRefreshToken(): Promise<string | null> {
  try {
    const raw = JSON.parse(await fs.readFile(storePath(), "utf8"));
    const grant = unseal<StoredGrant>(raw?.sealed);
    return grant?.refreshToken ?? null;
  } catch {
    return null;
  }
}

export async function forgetGrant(): Promise<void> {
  accessCache = null;
  try {
    await fs.rm(storePath(), { force: true });
  } catch {
    /* nothing stored */
  }
}

export async function googleIsConnected(): Promise<boolean> {
  return googleCredentials() !== null && (await readRefreshToken()) !== null;
}

/**
 * Access tokens last an hour; cache one in memory and refresh under it.
 * `invalid_grant` means the user revoked access in their Google account —
 * treat the grant as gone rather than retrying forever.
 */
let accessCache: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string | null> {
  const creds = googleCredentials();
  if (!creds) return null;

  if (accessCache && Date.now() < accessCache.expiresAt - 60_000) {
    return accessCache.token;
  }

  const refreshToken = await readRefreshToken();
  if (!refreshToken) return null;

  const res = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
    method: "POST",
    timeoutMs: 8000,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    if (body.includes("invalid_grant")) {
      // Revoked from the Google side. Forget ours so the UI offers reconnect.
      await forgetGrant();
      return null;
    }
    throw new Error(`Google token refresh responded ${res.status}`);
  }

  const parsed = await res.json();
  if (typeof parsed?.access_token !== "string") {
    throw new Error("Google returned no access token");
  }

  accessCache = {
    token: parsed.access_token,
    expiresAt: Date.now() + (Number(parsed.expires_in) || 3600) * 1000,
  };
  return accessCache.token;
}

/** Test seam. */
export function resetAccessCache() {
  accessCache = null;
}

/** A signed GET against a Google API, or null when not connected. */
export async function googleGet(url: string): Promise<Record<string, unknown> | null> {
  const token = await getAccessToken();
  if (!token) return null;

  const res = await fetchWithTimeout(url, {
    timeoutMs: 8000,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (res.status === 401) {
    accessCache = null;
    throw new Error("Google rejected the access token");
  }
  if (!res.ok) throw new Error(`Google responded ${res.status}`);
  return res.json();
}
