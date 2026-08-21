import type { Token } from "./oauth";

/**
 * Access tokens live in server memory only — never in a cookie, never in the
 * browser. The browser holds an opaque session id and nothing else.
 *
 * Losing these on restart is not a real cost: E*TRADE expires every access
 * token at midnight US Eastern regardless, so a daily reconnect is built into
 * the product either way.
 */

type Session = { token: Token; createdAt: number };

const sessions = new Map<string, Session>();
const pendingRequestTokens = new Map<string, Token>();

export const SESSION_COOKIE = "mb_etrade_session";

export function putPending(sessionId: string, token: Token) {
  pendingRequestTokens.set(sessionId, token);
}

export function takePending(sessionId: string): Token | undefined {
  const token = pendingRequestTokens.get(sessionId);
  pendingRequestTokens.delete(sessionId);
  return token;
}

export function putSession(sessionId: string, token: Token) {
  sessions.set(sessionId, { token, createdAt: Date.now() });
}

export function getSession(sessionId: string | undefined): Token | undefined {
  if (!sessionId) return undefined;
  const session = sessions.get(sessionId);
  if (!session) return undefined;

  // E*TRADE kills the token at midnight US Eastern. Drop ours at the same
  // boundary so the UI asks for a reconnect instead of showing a 401.
  if (easternDayOf(session.createdAt) !== easternDayOf(Date.now())) {
    sessions.delete(sessionId);
    return undefined;
  }
  return session.token;
}

export function clearSession(sessionId: string | undefined) {
  if (!sessionId) return;
  sessions.delete(sessionId);
  pendingRequestTokens.delete(sessionId);
}

function easternDayOf(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", { timeZone: "America/New_York" });
}
