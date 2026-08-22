import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCache } from "@/lib/cache";
import { getWatchlist } from "@/lib/providers/quotes";

/**
 * A trimmed but structurally faithful Yahoo v8 chart response. Only `meta`
 * matters to the panel, which is the reason this endpoint was chosen over v7.
 */
function chart(meta: Record<string, unknown>) {
  return { chart: { result: [{ meta }] } };
}

function quote(symbol: string, price: number, previousClose: number, extra: Record<string, unknown> = {}) {
  return chart({
    symbol,
    shortName: `${symbol} Inc.`,
    regularMarketPrice: price,
    chartPreviousClose: previousClose,
    currency: "USD",
    ...extra,
  });
}

/** Answer each symbol from a map; anything absent fails the way Yahoo would. */
function serve(bodies: Record<string, unknown>, status: Record<string, number> = {}) {
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
    const symbol = decodeURIComponent(String(input).split("/chart/")[1]?.split("?")[0] ?? "");
    if (status[symbol]) return new Response("nope", { status: status[symbol] });
    const body = bodies[symbol];
    if (!body) return new Response("nope", { status: 404 });
    return new Response(JSON.stringify(body), { status: 200 });
  }));
}

beforeEach(() => {
  clearCache();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearCache();
});

describe("getWatchlist", () => {
  it("reads a chart payload into a quote, with the day's move worked out", async () => {
    serve({ VTI: quote("VTI", 303, 300) });

    const { value } = await getWatchlist([{ symbol: "VTI", shares: 120, speak: true }]);
    const vti = value.quotes[0];

    expect(vti.name).toBe("VTI Inc.");
    expect(vti.price).toBe(303);
    expect(vti.dayChange).toBe(3);
    expect(vti.dayChangePct).toBeCloseTo(1, 5);
    expect(vti.currency).toBe("USD");
    expect(vti.shares).toBe(120);
  });

  it("falls back to previousClose when the chart omits chartPreviousClose", async () => {
    serve({
      AAPL: chart({
        symbol: "AAPL",
        longName: "Apple",
        regularMarketPrice: 220,
        previousClose: 200,
        currency: "USD",
      }),
    });

    const { value } = await getWatchlist([{ symbol: "AAPL", shares: 1, speak: true }]);
    expect(value.quotes[0].previousClose).toBe(200);
    expect(value.quotes[0].dayChangePct).toBeCloseTo(10, 5);
  });

  /**
   * The quiet failure this guard exists for: Yahoo answers 200 with a `meta`
   * block that has no usable price, which would otherwise become NaN and be
   * rendered as a real number.
   */
  it("treats a 200 with no usable price as a failure, not a zero", async () => {
    serve({
      VTI: quote("VTI", 303, 300),
      GHOST: chart({ symbol: "GHOST", regularMarketPrice: null, chartPreviousClose: null }),
      ZERO: quote("ZERO", 10, 0),
    });

    const { value } = await getWatchlist([
      { symbol: "VTI", shares: 1, speak: true },
      { symbol: "GHOST", shares: 1, speak: true },
      { symbol: "ZERO", shares: 1, speak: true },
    ]);

    expect(value.degraded).toEqual(["GHOST", "ZERO"]);
    expect(value.quotes.map((q) => q.symbol)).toEqual(["VTI"]);
    expect(value.quotes.every((q) => Number.isFinite(q.dayChangePct))).toBe(true);
  });

  it("names the symbol that failed rather than losing the whole panel", async () => {
    serve({ VTI: quote("VTI", 303, 300) }, { DELISTED: 404 });

    const { value } = await getWatchlist([
      { symbol: "VTI", shares: 1, speak: true },
      { symbol: "DELISTED", shares: 1, speak: true },
    ]);

    expect(value.degraded).toEqual(["DELISTED"]);
    expect(value.quotes).toHaveLength(1);
  });

  it("only gives up when every symbol fails", async () => {
    serve({}, { VTI: 500, AAPL: 500 });

    await expect(
      getWatchlist([
        { symbol: "VTI", shares: 1, speak: true },
        { symbol: "AAPL", shares: 1, speak: true },
      ]),
    ).rejects.toThrow("Every quote failed");
  });

  it("totals by shares held, ignoring symbols you only watch", async () => {
    serve({
      VTI: quote("VTI", 110, 100),  // held: +10 x 10 shares = +100
      WATCH: quote("WATCH", 500, 250), // watched only: must not reach the totals
    });

    const { value } = await getWatchlist([
      { symbol: "VTI", shares: 10, speak: true },
      { symbol: "WATCH", shares: 0, speak: true },
    ]);

    expect(value.totalValue).toBe(1100);
    expect(value.dayChange).toBe(100);
    // 100 gained on a previous value of 1000.
    expect(value.dayChangePct).toBeCloseTo(10, 5);
  });

  it("reports no move rather than dividing by zero for a watch-only list", async () => {
    serve({ WATCH: quote("WATCH", 500, 250) });

    const { value } = await getWatchlist([{ symbol: "WATCH", shares: 0, speak: true }]);

    expect(value.totalValue).toBe(0);
    expect(value.dayChangePct).toBe(0);
  });

  it("puts the biggest movers first, in either direction", async () => {
    serve({
      FLAT: quote("FLAT", 100, 100),
      DOWN: quote("DOWN", 80, 100),
      UP: quote("UP", 105, 100),
    });

    const { value } = await getWatchlist([
      { symbol: "FLAT", shares: 1, speak: true },
      { symbol: "DOWN", shares: 1, speak: true },
      { symbol: "UP", shares: 1, speak: true },
    ]);

    expect(value.quotes.map((q) => q.symbol)).toEqual(["DOWN", "UP", "FLAT"]);
  });

  it("keys the cache by the holdings, so an edited watchlist is refetched", async () => {
    serve({ VTI: quote("VTI", 303, 300), AAPL: quote("AAPL", 220, 200) });

    await getWatchlist([{ symbol: "VTI", shares: 1, speak: true }]);
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    // Same holdings: served from cache.
    await getWatchlist([{ symbol: "VTI", shares: 1, speak: true }]);
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls);

    // A changed share count is a different portfolio and must go upstream.
    await getWatchlist([{ symbol: "VTI", shares: 2, speak: true }]);
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(calls);
  });
});
