import { describe, expect, it } from "vitest";
import { googleNewsFeedFor, localFeedsFor, localityKey } from "@/lib/feeds";

describe("localityKey", () => {
  it("takes the locality off a reverse-geocoded label", () => {
    expect(localityKey("Lantana, Florida")).toBe("lantana");
    expect(localityKey("Seattle, WA")).toBe("seattle");
  });

  /**
   * Nominatim hands back whichever administrative level it has for a point,
   * so the same spot can come back as a town, a county or a neighbourhood.
   */
  it("normalises the administrative suffixes Nominatim adds", () => {
    expect(localityKey("Palm Beach County, Florida")).toBe("palm beach");
    expect(localityKey("Town of Lake Worth, Florida")).toBe("of lake worth");
    expect(localityKey("  WEST PALM BEACH , FL ")).toBe("west palm beach");
  });
});

describe("localFeedsFor", () => {
  it("routes Lantana to the Palm Beach County newsrooms", () => {
    const names = localFeedsFor("Lantana, Florida").map((feed) => feed.name);
    expect(names).toContain("Palm Beach Post");
    expect(names.length).toBeGreaterThan(1);
  });

  it("routes the neighbouring towns to the same newsrooms", () => {
    for (const place of ["Lake Worth, Florida", "Boynton Beach, Florida", "West Palm Beach, FL"]) {
      expect(localFeedsFor(place).length).toBeGreaterThan(0);
    }
  });

  it("has nothing curated for a city nobody added", () => {
    expect(localFeedsFor("Ouagadougou, Burkina Faso")).toEqual([]);
  });
});

describe("googleNewsFeedFor", () => {
  it("builds a geo feed for any city, escaping the name", () => {
    const feed = googleNewsFeedFor("West Palm Beach, Florida");
    expect(feed.url).toContain("West%20Palm%20Beach");
    expect(feed.url).not.toContain("Florida");
    expect(feed.name).toBe("West Palm Beach (Google News)");
  });
});
