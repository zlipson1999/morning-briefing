export type Feed = { name: string; url: string };

/**
 * Wire services for the "important globally" half of the panel.
 *
 * These are deliberately hand-picked rather than pulled from an aggregator:
 * you know exactly whose editorial judgement you're getting, there's no API
 * key, no quota, and no rate limit to design around.
 */
export const GLOBAL_FEEDS: Feed[] = [
  { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { name: "NPR", url: "https://feeds.npr.org/1001/rss.xml" },
  { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { name: "Guardian World", url: "https://www.theguardian.com/world/rss" },
];

/**
 * Local outlets, keyed by lowercased city name.
 *
 * Add your own city here — a real local newsroom's own feed beats anything an
 * aggregator will give you, and it's the single highest-value edit in this
 * file. Anything not listed falls back to Google News' geo feed below, which
 * works everywhere but runs noticeably staler.
 */
export const LOCAL_FEEDS: Record<string, Feed[]> = {
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
 * Google News' geo feed is the universal fallback: it needs no key and covers
 * any city. The tradeoff is freshness — a 2026 survey of its RSS output found
 * a median item age of about 6.6 days, with only ~7.6% under six hours old.
 * That's why it's the fallback and never the primary, and why every headline
 * this panel renders carries its age.
 */
export function localFeedsFor(place: string): Feed[] {
  const city = place.split(",")[0].trim().toLowerCase();
  const curated = LOCAL_FEEDS[city];
  if (curated?.length) return curated;

  return [
    {
      name: `${place.split(",")[0].trim()} (Google News)`,
      url:
        "https://news.google.com/rss/headlines/section/geo/" +
        encodeURIComponent(city) +
        "?hl=en-US&gl=US&ceid=US:en",
    },
  ];
}
