import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rankByImportance, rankingIsConfigured } from "@/lib/providers/news-rank";
import type { Headline } from "@/lib/providers/news";

function headline(title: string, minutesOld = 60): Headline {
  return {
    id: title,
    title,
    link: `https://example.com/${encodeURIComponent(title)}`,
    source: "Palm Beach Post",
    publishedAt: Date.now() - minutesOld * 60_000,
    summary: "",
  };
}

const ITEMS = [
  headline("Sports recap: Lions win"),
  headline("Bridge closed after crash on Dixie Highway"),
  headline("Council votes on utility rates"),
  headline("Best brunch spots, ranked"),
];

/** The model returns a JSON array of 1-based positions. */
function replyWith(text: string) {
  return {
    messages: {
      create: vi.fn(async () => ({
        stop_reason: "end_turn",
        content: [{ type: "text", text }],
      })),
    },
  };
}

let fake: ReturnType<typeof replyWith>;

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = fake.messages;
  },
}));

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("rankByImportance", () => {
  it("is off without a key, and says the list wasn't curated", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(rankingIsConfigured()).toBe(false);

    const result = await rankByImportance(ITEMS, "Lantana, Florida", 2);
    expect(result.curated).toBe(false);
    expect(result.headlines).toEqual(ITEMS.slice(0, 2));
  });

  it("reorders and drops by what the model chose", async () => {
    fake = replyWith("[2,3]");

    const result = await rankByImportance(ITEMS, "Lantana, Florida", 6);
    expect(result.curated).toBe(true);
    expect(result.headlines.map((item) => item.title)).toEqual([
      "Bridge closed after crash on Dixie Highway",
      "Council votes on utility rates",
    ]);
  });

  it("never returns more than the limit", async () => {
    fake = replyWith("[2,3,1,4]");
    expect((await rankByImportance(ITEMS, "Lantana, Florida", 2)).headlines).toHaveLength(2);
  });

  /** A model is not a parser: everything it returns has to be checked. */
  it("ignores out-of-range, duplicate and non-numeric positions", async () => {
    fake = replyWith('[2, 2, 99, 0, -1, "x", 3]');

    const result = await rankByImportance(ITEMS, "Lantana, Florida", 6);
    expect(result.headlines.map((item) => item.title)).toEqual([
      "Bridge closed after crash on Dixie Highway",
      "Council votes on utility rates",
    ]);
  });

  it("digs the array out of a chatty or fenced reply", async () => {
    fake = replyWith("Here you go:\n```json\n[3,2]\n```");
    expect((await rankByImportance(ITEMS, "Lantana, Florida", 6)).headlines[0].title)
      .toBe("Council votes on utility rates");
  });

  it("falls back to recency on unparseable output", async () => {
    fake = replyWith("I'd rather describe them in prose.");

    const result = await rankByImportance(ITEMS, "Lantana, Florida", 3);
    expect(result.curated).toBe(false);
    expect(result.headlines).toEqual(ITEMS.slice(0, 3));
  });

  it("falls back to recency when the call throws", async () => {
    fake = { messages: { create: vi.fn(async () => { throw new Error("network"); }) } } as never;

    const result = await rankByImportance(ITEMS, "Lantana, Florida", 3);
    expect(result.curated).toBe(false);
    expect(result.headlines).toEqual(ITEMS.slice(0, 3));
  });

  it("falls back when the model refuses", async () => {
    fake = {
      messages: {
        create: vi.fn(async () => ({ stop_reason: "refusal", content: [], stop_details: { category: "x" } })),
      },
    } as never;

    expect((await rankByImportance(ITEMS, "Lantana, Florida", 3)).curated).toBe(false);
  });

  it("doesn't bother calling out for a single headline", async () => {
    fake = replyWith("[1]");
    const result = await rankByImportance([ITEMS[0]], "Lantana, Florida", 6);

    expect(result.curated).toBe(false);
    expect(fake.messages.create).not.toHaveBeenCalled();
  });
});
