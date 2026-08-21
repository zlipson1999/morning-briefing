/**
 * Everything you'd want to change about your own briefing lives here.
 */

export const USER_NAME = "Zach";

/**
 * The assistant's name. It's what the header and boot screen show, what the
 * spoken briefing calls itself, and — lowercased — the wake word: say
 * "Hey Miles" with listening enabled and it answers.
 */
export const ASSISTANT_NAME = "Miles";
export const ASSISTANT_TAGLINE = "My Integrated Life Efficiency System";

/**
 * Fallback location, used before the browser grants geolocation and whenever
 * it's denied or unavailable. Set this to where you actually are.
 */
export const HOME_LOCATION = {
  label: "Lantana, Florida",
  latitude: 26.5867,
  longitude: -80.052,
} as const;

/** Panel refresh cadence, in ms. Server-side caching means these are cheap. */
export const REFRESH_MS = {
  news: 10 * 60_000,
  weather: 15 * 60_000,
  portfolio: 60_000,
} as const;

export type Holding = {
  symbol: string;
  /** Shares you hold. Leave at 0 to watch a symbol without owning it. */
  shares?: number;
  /**
   * Whether the spoken briefing may mention it. Defaults to true — set false
   * for the ones you want on screen but not read out.
   */
  speak?: boolean;
};

/**
 * What the portfolio panel shows without an E*TRADE login.
 *
 * Quotes come from Yahoo with no key and no account, so this works every
 * morning with no action from you. Edit the list: `shares` turns a watched
 * symbol into a held one and puts it in the total, and `speak: false` keeps
 * it on screen but out of the briefing.
 *
 * Connecting E*TRADE replaces all of this with your real positions.
 */
export const WATCHLIST: Holding[] = [
  { symbol: "SPY", speak: true },
  { symbol: "QQQ", speak: true },
  { symbol: "NVDA", shares: 40, speak: true },
  { symbol: "AAPL", shares: 65, speak: true },
  { symbol: "VTI", shares: 120, speak: false },
  { symbol: "MSFT", shares: 22, speak: false },
];
