export type Position = {
  symbol: string;
  description: string;
  quantity: number;
  lastPrice: number;
  dayChange: number;
  dayChangePct: number;
  marketValue: number;
  totalGain: number;
  totalGainPct: number;
};

export type Portfolio = {
  accountLabel: string;
  totalValue: number;
  dayChange: number;
  dayChangePct: number;
  positions: Position[];
  /** How this data was obtained, so the UI can be honest about it. */
  mode: "mock" | "sandbox" | "live";
};

export type ConnectionState =
  | { connected: true; mode: Portfolio["mode"] }
  | { connected: false; mode: Portfolio["mode"]; reason: "no-credentials" | "not-connected" | "expired" };
