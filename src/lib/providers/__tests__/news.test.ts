import { describe, expect, it } from "vitest";
import { dedupe, parseFeed, type Headline } from "../news";

/* Real feeds are messier than the spec. These fixtures reproduce the shapes
   that actually break naive parsers: CDATA, HTML in titles, entity escapes,
   Atom's attribute links, RDF's flat item list, and single-item feeds that
   xml parsers hand back as an object rather than an array. */

const RSS_2 = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Example Wire</title>
  <item>
    <title><![CDATA[Markets open <b>sharply</b> lower]]></title>
    <link>https://example.com/a</link>
    <pubDate>Fri, 21 Aug 2026 06:30:00 GMT</pubDate>
    <description>&lt;p&gt;Futures slid overnight &amp;amp; stayed there.&lt;/p&gt;</description>
  </item>
  <item>
    <title>Second story</title>
    <link>https://example.com/b</link>
  </item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Atom headline</title>
    <link rel="self" href="https://example.org/self"/>
    <link href="https://example.org/story"/>
    <updated>2026-08-21T07:15:00Z</updated>
    <summary>A summary.</summary>
  </entry>
</feed>`;

const RDF = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <item>
    <title>RDF headline</title>
    <link>https://example.net/story</link>
    <dc:date>2026-08-21T04:00:00Z</dc:date>
  </item>
</rdf:RDF>`;

describe("parseFeed", () => {
  it("reads RSS 2.0 and strips CDATA and HTML from titles", () => {
    const items = parseFeed(RSS_2, "Example Wire");
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("Markets open sharply lower");
    expect(items[0].link).toBe("https://example.com/a");
    expect(items[0].source).toBe("Example Wire");
  });

  it("decodes escaped entities in descriptions", () => {
    const [first] = parseFeed(RSS_2, "Example Wire");
    expect(first.summary).toBe("Futures slid overnight & stayed there.");
  });

  it("parses pubDate into a timestamp", () => {
    const [first] = parseFeed(RSS_2, "Example Wire");
    expect(first.publishedAt).toBe(Date.parse("Fri, 21 Aug 2026 06:30:00 GMT"));
  });

  it("tolerates a missing date rather than dropping the item", () => {
    const items = parseFeed(RSS_2, "Example Wire");
    expect(items[1].publishedAt).toBeNull();
    expect(items[1].title).toBe("Second story");
  });

  it("reads Atom and skips rel=self when picking the link", () => {
    const [entry] = parseFeed(ATOM, "Atom Source");
    expect(entry.link).toBe("https://example.org/story");
    expect(entry.publishedAt).toBe(Date.parse("2026-08-21T07:15:00Z"));
  });

  it("reads RDF feeds and their dc:date", () => {
    const [entry] = parseFeed(RDF, "RDF Source");
    expect(entry.title).toBe("RDF headline");
    expect(entry.publishedAt).toBe(Date.parse("2026-08-21T04:00:00Z"));
  });

  it("returns nothing for junk instead of throwing", () => {
    expect(parseFeed("<html><body>not a feed</body></html>", "Broken")).toEqual([]);
    expect(parseFeed("", "Empty")).toEqual([]);
  });

  it("drops entries with no title or no link", () => {
    const partial = `<rss version="2.0"><channel>
      <item><title>No link here</title></item>
      <item><link>https://example.com/c</link></item>
      <item><title>Good</title><link>https://example.com/d</link></item>
    </channel></rss>`;
    const items = parseFeed(partial, "Partial");
    expect(items.map((i) => i.title)).toEqual(["Good"]);
  });
});

describe("dedupe", () => {
  const make = (title: string, source: string): Headline => ({
    id: `${source}:${title}`, title, link: `https://x/${title}`, source,
    publishedAt: 0, summary: "",
  });

  it("collapses the same story reported by two outlets", () => {
    const items = dedupe([
      make("Markets open sharply lower", "BBC"),
      make("Markets open sharply lower!", "NPR"),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].source).toBe("BBC");
  });

  it("keeps genuinely different stories", () => {
    const items = dedupe([make("Markets open lower", "BBC"), make("Storm hits coast", "NPR")]);
    expect(items).toHaveLength(2);
  });
});
