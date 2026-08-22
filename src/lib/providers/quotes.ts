import { cached, fetchWithTimeout } from "@/lib/cache";
import { WATCHLIST, type Holding } from "@/lib/config";

/**
 * Keyless quotes from Yahoo Finance.
 *
 * The portfolio panel used to need an E*TRADE login every morning — OAuth
 * 1.0a tokens die at midnight US Eastern, so it was the one thing on the
 * dashboard that required a daily human action. This is the default now:
 * no account, no key, no expiry, and it works before the market opens.
 *
 * E*TRADE stays as an optional upgrade for real positions and cost basis.
 *
 * The v8 chart endpoint is used rather than v7 quote: v7 has grown a
 * crumb/cookie requirement, v8 has not, and everything the panel shows is in
 * the chart's `meta` block.
 */

export type Quote = {
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  dayChange: number;
  dayChangePct: number;
  currency: string;
  /** Shares held, or 0 for a symbol you're only watching. */
  shares: number;
  /** Whether the briefing is allowed to mention it out loud. */
  speak: boolean;
};

export type Watchlist = {
  quotes: Quote[];
  /** Total market value of the symbols you actually hold shares in. */
  totalValue: number;
  dayChange: number;
  dayChangePct: number;
  /** Symbols that failed, so the panel can name them rather than hide them. */
  degraded: string[];
};

async function fetchQuote(holding: Holding): Promise<Quote> {
  const res = await fetchWithTimeout(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(holding.symbol)}` +
      "?range=1d&interval=1d",
    {
      timeoutMs: 7000,
      headers: {
        // Yahoo 403s an unidentified client.
        "User-Agent": "Mozilla/5.0 (compatible; morning-briefing/1.0)",
        Accept: "application/json",
      },
    },
  );

  if (!res.ok) throw new Error(`${holding.symbol} responded ${res.status}`);

  const meta = (await res.json())?.chart?.result?.[0]?.meta;
  if (!meta) throw new Error(`${holding.symbol} returned no quote`);

  const price = Number(meta.regularMarketPrice);
  const previousClose = Number(meta.chartPreviousClose ?? meta.previousClose);
  if (!Number.isFinite(price) || !Number.isFinite(previousClose) || previousClose === 0) {
    throw new Error(`${holding.symbol} returned no usable price`);
  }

  return {
    symbol: String(meta.symbol ?? holding.symbol),
    name: String(meta.shortName ?? meta.longName ?? holding.symbol),
    price,
    previousClose,
    dayChange: price - previousClose,
    dayChangePct: ((price - previousClose) / previousClose) * 100,
    currency: String(meta.currency ?? "USD"),
    shares: holding.shares ?? 0,
    speak: holding.speak !== false,
  };
}

/**
 * Fetches every symbol concurrently and isolates failures, the same way the
 * news panel does: one delisted ticker costs you that row, not the panel.
 */
export async function getWatchlist(
  holdings: readonly Holding[] = WATCHLIST,
): Promise<{ value: Watchlist; stale: boolean }> {
  const key = `quotes:${holdings.map((h) => `${h.symbol}:${h.shares ?? 0}`).join(",")}`;

  return cached(key, { ttlMs: 60_000 }, async () => {
    const degraded: string[] = [];
    const results = await Promise.allSettled(holdings.map(fetchQuote));

    const quotes: Quote[] = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        quotes.push(result.value);
      } else {
        console.error(`[quotes] ${holdings[index].symbol}:`, result.reason);
        degraded.push(holdings[index].symbol);
      }
    });

    if (quotes.length === 0) throw new Error("Every quote failed");

    const held = quotes.filter((quote) => quote.shares > 0);
    const totalValue = held.reduce((sum, quote) => sum + quote.price * quote.shares, 0);
    const dayChange = held.reduce((sum, quote) => sum + quote.dayChange * quote.shares, 0);
    const previousValue = totalValue - dayChange;

    return {
      // Biggest movers first: the outliers are the only ones worth reading.
      quotes: quotes.sort((a, b) => Math.abs(b.dayChangePct) - Math.abs(a.dayChangePct)),
      totalValue,
      dayChange,
      dayChangePct: previousValue > 0 ? (dayChange / previousValue) * 100 : 0,
      degraded,
    } satisfies Watchlist;
  });
}
