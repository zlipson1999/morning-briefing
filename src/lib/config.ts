/**
 * Everything you'd want to change about your own briefing lives here.
 */

export const USER_NAME = "Zach";

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
