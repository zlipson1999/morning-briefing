import { seal, unseal } from "./seal";
import type { Token } from "./oauth";

/**
 * E*TRADE session state, carried in sealed httpOnly cookies.
 *
 * The access token is encrypted with a server-side key before it goes into the
 * cookie, so the browser holds ciphertext it cannot read and cannot forge, and
 * the server holds no per-session memory at all. That last part is the point:
 * the previous in-memory Map quietly failed on any host running more than one
 * instance.
 *
 * Expiry is still enforced here rather than left to the cookie: E*TRADE kills
 * every access token at midnight US Eastern, so a token minted on a different
 * Eastern day is already dead and the UI should ask for a reconnect instead of
 * rendering a 401.
 */

export const SESSION_COOKIE = "mb_etrade";
export const PENDING_COOKIE = "mb_etrade_pending";

/** The OAuth dance is a round trip to etrade.com — minutes, not hours. */
const PENDING_TTL_MS = 15 * 60_000;

type SessionPayload = { token: Token; day: string };
type PendingPayload = { token: Token; createdAt: number };

export type SessionRead =
  | { status: "ok"; token: Token }
  | { status: "none" }
  | { status: "expired" };

function easternDayOf(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", { timeZone: "America/New_York" });
}

export function sealSession(token: Token): string {
  return seal({ token, day: easternDayOf(Date.now()) } satisfies SessionPayload);
}

export function readSession(sealed: string | undefined | null): SessionRead {
  if (!sealed) return { status: "none" };

  const payload = unseal<SessionPayload>(sealed);
  // Unreadable means the signing key changed (a restart with no
  // SESSION_SECRET) — from the reader's point of view, an expired session.
  if (!payload?.token?.key || !payload.token.secret) return { status: "expired" };
  if (payload.day !== easternDayOf(Date.now())) return { status: "expired" };

  return { status: "ok", token: payload.token };
}

export function sealPending(token: Token): string {
  return seal({ token, createdAt: Date.now() } satisfies PendingPayload);
}

export function readPending(sealed: string | undefined | null): Token | null {
  const payload = unseal<PendingPayload>(sealed);
  if (!payload?.token?.key || !payload.token.secret) return null;
  if (Date.now() - payload.createdAt > PENDING_TTL_MS) return null;
  return payload.token;
}

const BASE_COOKIE = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
};

/** Long enough to cover a day at the desk; the Eastern-day check is the real bound. */
export const SESSION_COOKIE_OPTIONS = { ...BASE_COOKIE, maxAge: 60 * 60 * 24 };
export const PENDING_COOKIE_OPTIONS = { ...BASE_COOKIE, maxAge: PENDING_TTL_MS / 1000 };
