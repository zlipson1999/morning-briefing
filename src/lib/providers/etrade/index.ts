import { cookies } from "next/headers";
import { credentials, fetchPortfolio, UnauthorizedError } from "./client";
import { mockPortfolio } from "./mock";
import { readSession, SESSION_COOKIE } from "./session";
import type { ConnectionState, Portfolio } from "./types";

export { UnauthorizedError };
export * from "./types";
export {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  PENDING_COOKIE,
  PENDING_COOKIE_OPTIONS,
} from "./session";

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

  const sealed = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = readSession(sealed);

  if (session.status !== "ok") {
    return {
      portfolio: mockPortfolio(),
      state: {
        connected: false,
        mode: creds.mode,
        reason: session.status === "expired" ? "expired" : "not-connected",
      },
    };
  }

  const portfolio = await fetchPortfolio(session.token);
  return { portfolio, state: { connected: true, mode: creds.mode } };
}
