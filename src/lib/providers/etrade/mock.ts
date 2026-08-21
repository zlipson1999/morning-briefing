import type { Portfolio } from "./types";

/**
 * Stands in until a real E*TRADE key is wired up, and stays useful afterwards
 * for working on the panel without burning API calls or waiting for market
 * hours. Same shape the live client returns, so the panel can't tell them
 * apart — which is the point.
 */
export function mockPortfolio(): Portfolio {
  const positions = [
    { symbol: "NVDA", description: "NVIDIA Corp", quantity: 40, lastPrice: 172.34, dayChangePct: -2.14, totalGainPct: 61.2 },
    { symbol: "AAPL", description: "Apple Inc", quantity: 65, lastPrice: 231.08, dayChangePct: 0.42, totalGainPct: 18.7 },
    { symbol: "VTI", description: "Vanguard Total Stock Market ETF", quantity: 120, lastPrice: 302.91, dayChangePct: 0.18, totalGainPct: 24.3 },
    { symbol: "MSFT", description: "Microsoft Corp", quantity: 22, lastPrice: 448.6, dayChangePct: 1.07, totalGainPct: 33.9 },
    { symbol: "TSLA", description: "Tesla Inc", quantity: 15, lastPrice: 254.77, dayChangePct: -3.61, totalGainPct: -8.4 },
  ].map((p) => {
    const marketValue = p.quantity * p.lastPrice;
    const dayChange = (p.lastPrice * p.dayChangePct) / 100;
    return {
      ...p,
      dayChange,
      marketValue,
      totalGain: marketValue - marketValue / (1 + p.totalGainPct / 100),
    };
  });

  const totalValue = positions.reduce((sum, p) => sum + p.marketValue, 0);
  const dayChange = positions.reduce((sum, p) => sum + p.dayChange * p.quantity, 0);

  return {
    accountLabel: "Individual Brokerage ••4417",
    totalValue,
    dayChange,
    dayChangePct: (dayChange / (totalValue - dayChange)) * 100,
    positions: positions.sort((a, b) => b.marketValue - a.marketValue),
    mode: "mock",
  };
}
