export type Feed = { name: string; url: string };

/**
 * Wire services for the "important globally" half of the panel.
 *
 * These are deliberately hand-picked rather than pulled from an aggregator:
 * you know exactly whose editorial judgement you're getting, there's no API
 * key, no quota, and no rate limit to design around.
 */
export const FLORIDA_FEEDS: Feed[] = [
  { name: "Florida Politics", url: "https://floridapolitics.com/feed/" },
  { name: "Florida Phoenix", url: "https://floridaphoenix.com/feed/" },
];

export const US_FEEDS: Feed[] = [
  { name: "NPR National", url: "https://feeds.npr.org/1003/rss.xml" },
  { name: "BBC US & Canada", url: "https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml" },
  { name: "New York Times U.S.", url: "https://rss.nytimes.com/services/xml/rss/nyt/US.xml" },
];

export const WORLD_FEEDS: Feed[] = [
  { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { name: "Guardian World", url: "https://www.theguardian.com/world/rss" },
];

/**
 * Palm Beach County and the Treasure Coast — Lantana's actual newsrooms.
 * The Post is the paper of record for the county; the Sun Sentinel covers
 * Palm Beach and Broward together; WPBF is the local ABC affiliate.
 */
const SOUTH_FLORIDA: Feed[] = [
  { name: "Palm Beach Post", url: "https://www.palmbeachpost.com/arc/outboundfeeds/rss/category/news/?outputType=xml" },
  { name: "Sun Sentinel", url: "https://www.sun-sentinel.com/feed/" },
  { name: "WPBF 25", url: "https://www.wpbf.com/topstories-rss" },
];

/**
 * Local outlets, keyed by lowercased locality.
 *
 * Add your own city here — a real local newsroom's own feed beats anything an
 * aggregator will give you, and it's the single highest-value edit in this
 * file. Anything not listed falls back to Google News' geo feed, and so does
 * any city whose curated feeds all fail.
 */
export const LOCAL_FEEDS: Record<string, Feed[]> = {
  // Palm Beach County — the towns are small enough that they share newsrooms,
  // so every nearby locality Nominatim might return maps to the same list.
  lantana: SOUTH_FLORIDA,
  "lake worth": SOUTH_FLORIDA,
  "lake worth beach": SOUTH_FLORIDA,
  "boynton beach": SOUTH_FLORIDA,
  "delray beach": SOUTH_FLORIDA,
  "west palm beach": SOUTH_FLORIDA,
  "palm beach": SOUTH_FLORIDA,
  "palm springs": SOUTH_FLORIDA,
  "boca raton": SOUTH_FLORIDA,
  "fort lauderdale": SOUTH_FLORIDA,

  seattle: [
    { name: "Seattle Times", url: "https://www.seattletimes.com/feed/" },
    { name: "KUOW", url: "https://www.kuow.org/index.xml" },
  ],
  "new york": [
    { name: "Gothamist", url: "https://gothamist.com/feed" },
    { name: "amNY", url: "https://www.amny.com/feed/" },
  ],
  "san francisco": [
    { name: "SF Standard", url: "https://sfstandard.com/feed/" },
    { name: "SFGate", url: "https://www.sfgate.com/bayarea/feed/Bay-Area-News-429.php" },
  ],
  chicago: [{ name: "Block Club Chicago", url: "https://blockclubchicago.org/feed/" }],
  austin: [{ name: "Austin Monitor", url: "https://www.austinmonitor.com/feed/" }],
  boston: [{ name: "Boston.com", url: "https://www.boston.com/feed/" }],
};

/**
 * Reverse geocoding hands back whatever OpenStreetMap calls the spot you're
 * standing on — "Lantana", "Palm Beach County", sometimes a neighbourhood.
 * Normalise before looking it up so all three land on the same newsrooms.
 */
export function localityKey(place: string): string {
  return place
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/\b(county|township|village|town|city)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function cityName(place: string): string {
  return place.split(",")[0].trim();
}

/**
 * Google News' geo feed is the universal fallback: it needs no key and covers
 * any city. The tradeoff is freshness — a 2026 survey of its RSS output found
 * a median item age of about 6.6 days, with only ~7.6% under six hours old.
 * That's why it's the fallback and never the primary, and why every headline
 * this panel renders carries its age.
 */
export function googleNewsFeedFor(place: string): Feed {
  const city = cityName(place);
  return {
    name: `${city} (Google News)`,
    url:
      "https://news.google.com/rss/headlines/section/geo/" +
      encodeURIComponent(city) +
      "?hl=en-US&gl=US&ceid=US:en",
  };
}

/** Curated feeds for this place, or an empty list if we don't have any. */
export function localFeedsFor(place: string): Feed[] {
  return LOCAL_FEEDS[localityKey(place)] ?? [];
}
