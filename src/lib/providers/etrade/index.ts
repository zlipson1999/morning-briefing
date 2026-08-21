import { cookies } from "next/headers";
import crypto from "node:crypto";
import { credentials, fetchPortfolio, UnauthorizedError } from "./client";
import { mockPortfolio } from "./mock";
import { getSession, SESSION_COOKIE } from "./session";
import type { ConnectionState, Portfolio } from "./types";

export { UnauthorizedError };
export * from "./types";

/**
 * Chooses the provider. With no consumer key configured the app runs on mock
 * data — the dashboard is fully usable before an E*TRADE key ever arrives,
 * and the panel says plainly which mode it is in.
 */
export async function readPortfolio(): Promise<
  { portfolio: Portfolio; state: ConnectionState }
> {
  const creds = credentials();

  if (!creds) {
    return {
      portfolio: mockPortfolio(),
      state: { connected: false, mode: "mock", reason: "no-credentials" },
    };
  }

  const sessionId = (await cookies()).get(SESSION_COOKIE)?.value;
  const token = getSession(sessionId);

  if (!token) {
    return {
      portfolio: mockPortfolio(),
      state: { connected: false, mode: creds.mode, reason: sessionId ? "expired" : "not-connected" },
    };
  }

  const portfolio = await fetchPortfolio(token);
  return { portfolio, state: { connected: true, mode: creds.mode } };
}

export async function sessionId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(SESSION_COOKIE)?.value;
  if (existing) return existing;
  return crypto.randomBytes(24).toString("hex");
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24,
};

export { SESSION_COOKIE };
