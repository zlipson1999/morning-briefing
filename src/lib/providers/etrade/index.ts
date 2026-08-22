import { cookies } from "next/headers";
import { credentials, fetchPortfolio, UnauthorizedError } from "./client";
import { mockPortfolio } from "./mock";
import { readSession, SESSION_COOKIE } from "./session";
import { getWatchlist } from "../quotes";
import type { ConnectionState, Portfolio, Position } from "./types";

export { UnauthorizedError };
export * from "./types";
export {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  PENDING_COOKIE,
  PENDING_COOKIE_OPTIONS,
} from "./session";

/**
 * Chooses the provider, best first.
 *
 *   1. E*TRADE, if it's configured and connected — real positions, real cost
 *      basis, and a login that expires at midnight US Eastern.
 *   2. The Yahoo watchlist — real prices on the symbols in config, with no
 *      key, no account and nothing to reconnect. This is the default, and it
 *      is why the dashboard no longer needs a daily human action.
 *   3. Sample positions, only if Yahoo is unreachable too.
 *
 * The panel says which one it's showing in every case.
 */
export async function readPortfolio(): Promise<
  { portfolio: Portfolio; state: ConnectionState }
> {
  const creds = credentials();

  if (creds) {
    const sealed = (await cookies()).get(SESSION_COOKIE)?.value;
    const session = readSession(sealed);

    if (session.status === "ok") {
      return {
        portfolio: await fetchPortfolio(session.token),
        state: { connected: true, mode: creds.mode },
      };
    }

    const fallback = await fallbackPortfolio();
    return {
      ...fallback,
      state: {
        connected: false,
        mode: creds.mode,
        reason: session.status === "expired" ? "expired" : "not-connected",
        // Honest, not hopeful: true only when the watchlist actually loaded.
        live: fallback.portfolio.mode === "watchlist",
      },
    };
  }

  const fallback = await fallbackPortfolio();
  return {
    ...fallback,
    state: {
      connected: false,
      mode: fallback.portfolio.mode,
      reason: "no-credentials",
      live: fallback.portfolio.mode === "watchlist",
    },
  };
}

/** Yahoo's watchlist, shaped as a Portfolio so the panel needs no second path. */
async function fallbackPortfolio(): Promise<{ portfolio: Portfolio }> {
  try {
    const { value } = await getWatchlist();

    const positions: Position[] = value.quotes.map((quote) => ({
      symbol: quote.symbol,
      description: quote.name,
      quantity: quote.shares,
      lastPrice: quote.price,
      dayChange: quote.dayChange,
      dayChangePct: quote.dayChangePct,
      marketValue: quote.price * quote.shares,
      // Cost basis is the one thing a quote can't tell you. Zero rather than
      // a guess: the panel hides the field when it's absent.
      totalGain: 0,
      totalGainPct: 0,
    }));

    return {
      portfolio: {
        accountLabel: value.totalValue > 0 ? "Watchlist" : "Watching",
        totalValue: value.totalValue,
        dayChange: value.dayChange,
        dayChangePct: value.dayChangePct,
        positions,
        mode: "watchlist",
        degraded: value.degraded.length ? value.degraded : undefined,
      },
    };
  } catch (error) {
    console.error("[portfolio] watchlist unavailable:", error);
    return { portfolio: mockPortfolio() };
  }
}
