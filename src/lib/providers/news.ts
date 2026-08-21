import { XMLParser } from "fast-xml-parser";
import { cached, fetchWithTimeout } from "@/lib/cache";
import { GLOBAL_FEEDS, googleNewsFeedFor, localFeedsFor, type Feed } from "@/lib/feeds";

export type Headline = {
  id: string;
  title: string;
  link: string;
  source: string;
  publishedAt: number | null;
  summary: string;
};

export type NewsBundle = {
  local: Headline[];
  global: Headline[];
  place: string;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  trimValues: true,
});

const asArray = <T,>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

/** Feed <title> and <description> routinely carry HTML and CDATA. Strip both. */
function plain(value: unknown): string {
  if (value == null) return "";
  const raw = typeof value === "object" ? ((value as Record<string, unknown>)["#text"] ?? "") : value;
  return String(raw)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function toTimestamp(value: unknown): number | null {
  if (!value) return null;
  const parsed = Date.parse(String(typeof value === "object" ? (value as Record<string, unknown>)["#text"] : value));
  return Number.isNaN(parsed) ? null : parsed;
}

function linkOf(entry: Record<string, unknown>): string {
  const link = entry.link;
  if (typeof link === "string") return link;
  // Atom puts the URL in an attribute, and may list several <link> elements.
  for (const candidate of asArray(link as Record<string, unknown>[])) {
    const href = candidate?.["@href"];
    if (typeof href === "string" && candidate["@rel"] !== "self") return href;
  }
  const guid = entry.guid;
  if (typeof guid === "string") return guid;
  return "";
}

/** Parses RSS 2.0, RDF and Atom — the three shapes real feeds actually ship. */
export function parseFeed(xml: string, source: string): Headline[] {
  const doc = parser.parse(xml);
  const entries = [
    ...asArray(doc?.rss?.channel?.item),
    ...asArray(doc?.["rdf:RDF"]?.item),
    ...asArray(doc?.feed?.entry),
  ] as Record<string, unknown>[];

  return entries
    .map((entry) => {
      const title = plain(entry.title);
      const link = linkOf(entry);
      if (!title || !link) return null;
      return {
        id: `${source}:${link}`,
        title,
        link,
        source,
        publishedAt:
          toTimestamp(entry.pubDate) ?? toTimestamp(entry.published) ?? toTimestamp(entry.updated) ?? toTimestamp(entry["dc:date"]),
        summary: plain(entry.description ?? entry.summary).slice(0, 240),
      } satisfies Headline;
    })
    .filter((item): item is Headline => item !== null);
}

async function loadFeed(feed: Feed): Promise<Headline[]> {
  const res = await fetchWithTimeout(feed.url, {
    timeoutMs: 7000,
    headers: {
      // Some outlets 403 an unidentified client.
      "User-Agent": "morning-briefing/1.0 (personal dashboard)",
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`${feed.name} responded ${res.status}`);
  return parseFeed(await res.text(), feed.name);
}

/** Near-identical headlines across outlets collapse to the first one seen. */
export function dedupe(items: Headline[]): Headline[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 70);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rank(items: Headline[], limit: number): Headline[] {
  return dedupe(items)
    .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
    .slice(0, limit);
}

/**
 * Fetches every feed concurrently and isolates failures: one dead outlet
 * costs you its headlines, not the panel. The names of anything that failed
 * come back in `degraded` so the UI can say so out loud rather than quietly
 * showing less news.
 */
export async function getNews(place: string): Promise<{
  value: NewsBundle;
  stale: boolean;
  degraded: string[];
}> {
  const degraded: string[] = [];

  const { value, stale } = await cached(`news:${place}`, { ttlMs: 10 * 60_000 }, async () => {
    const settle = async (feeds: Feed[]) => {
      const results = await Promise.allSettled(feeds.map(loadFeed));
      const items: Headline[] = [];
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          items.push(...result.value);
        } else {
          console.error(`[news] ${feeds[index].name}:`, result.reason);
          degraded.push(feeds[index].name);
        }
      });
      return items;
    };

    const [curated, global] = await Promise.all([
      settle(localFeedsFor(place)),
      settle(GLOBAL_FEEDS),
    ]);

    // A curated newsroom that changed its feed URL used to mean an empty
    // "Near me" tab with no explanation. Fall back to the geo feed instead:
    // staler, but local news beats no local news.
    const local = curated.length > 0 ? curated : await settle([googleNewsFeedFor(place)]);

    if (local.length === 0 && global.length === 0) {
      throw new Error("Every news source failed");
    }

    return {
      local: rank(local, 6),
      global: rank(global, 8),
      place,
    } satisfies NewsBundle;
  });

  return { value, stale, degraded };
}
