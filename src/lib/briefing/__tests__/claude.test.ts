import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCache } from "@/lib/cache";
import type { BriefingSnapshot } from "@/lib/briefing/snapshot";

/**
 * The Claude briefing is an upgrade path, never a dependency: no key, a
 * refusal, a network failure or an empty response must all end as the
 * deterministic briefing rather than as a broken dashboard. And because every
 * call costs money, identical minutes must not each buy their own generation.
 *
 * Both of those are contracts worth holding still, and neither is visible in
 * the prose the model happens to return.
 */

const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

const { claudeIsConfigured, composeWithClaude } = await import("@/lib/briefing/claude");

function reply(text: string) {
  return { stop_reason: "end_turn", content: [{ type: "text", text }] };
}

function snapshot(overrides: Partial<BriefingSnapshot> = {}): BriefingSnapshot {
  return {
    userName: "Zach",
    now: { weekday: "Friday", date: "August 21", time: "7:15 AM", hour: 7, minutes: 435 },
    weather: null,
    schedule: { remaining: 0, total: 0, events: [], freeWindows: [], conflicts: [] },
    inbox: { unread: 0, messages: [] },
    tasks: { open: 0, done: 0, items: [] },
    portfolio: null,
    news: { local: [], florida: [], us: [], world: [], curatedLocal: false },
    commute: null,
    tomorrow: null,
    ...overrides,
  };
}

beforeEach(() => {
  clearCache();
  create.mockReset();
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  clearCache();
});

describe("composeWithClaude", () => {
  it("does not reach for the API at all without a key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");

    expect(claudeIsConfigured()).toBe(false);
    expect(await composeWithClaude(snapshot())).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it("returns the text of the response, joined and trimmed", async () => {
    create.mockResolvedValue({
      stop_reason: "end_turn",
      content: [
        { type: "thinking", thinking: "not part of the briefing" },
        { type: "text", text: "  Good morning, Zach. " },
        { type: "text", text: "Your calendar is clear.  " },
      ],
    });

    expect(await composeWithClaude(snapshot())).toBe(
      "Good morning, Zach. Your calendar is clear.",
    );
  });

  /** Every failure is the same failure to the caller: fall back, don't throw. */
  it("falls back rather than throwing, whatever goes wrong", async () => {
    create.mockRejectedValue(new Error("upstream exploded"));
    expect(await composeWithClaude(snapshot())).toBeNull();

    clearCache();
    // Carrying text of its own: a refusal must be rejected on stop_reason, not
    // accidentally, by tripping over a response with nothing in it.
    create.mockResolvedValue({
      stop_reason: "refusal",
      stop_details: { category: "policy" },
      content: [{ type: "text", text: "I can't help with that." }],
    });
    expect(await composeWithClaude(snapshot())).toBeNull();

    clearCache();
    create.mockResolvedValue(reply("   "));
    expect(await composeWithClaude(snapshot())).toBeNull();
  });

  it("bills one generation for a minute's worth of reloads", async () => {
    create.mockResolvedValue(reply("Good morning, Zach."));

    await composeWithClaude(snapshot());
    await composeWithClaude(snapshot());
    await composeWithClaude(snapshot());

    expect(create).toHaveBeenCalledTimes(1);
  });

  it("keeps reloads inside a ten-minute bucket on one generation, and starts a new one after", async () => {
    create.mockResolvedValue(reply("Good morning, Zach."));
    const at = (minutes: number) => snapshot({ now: { ...snapshot().now, minutes } });

    await composeWithClaude(at(430));
    await composeWithClaude(at(439)); // same bucket
    expect(create).toHaveBeenCalledTimes(1);

    await composeWithClaude(at(440)); // next bucket
    expect(create).toHaveBeenCalledTimes(2);
  });

  /**
   * The cache key has to notice the things the briefing is *about*. A changed
   * inbox that reused a cached briefing would have Miles confidently reading
   * out mail that has already been dealt with.
   */
  it("regenerates when what the briefing is about has changed", async () => {
    create.mockResolvedValue(reply("Good morning, Zach."));
    await composeWithClaude(snapshot());
    expect(create).toHaveBeenCalledTimes(1);

    await composeWithClaude(snapshot({ tasks: { open: 3, done: 0, items: [] } }));
    expect(create).toHaveBeenCalledTimes(2);

    const mail = (subject: string) => ({
      unread: 1,
      messages: [
        {
          sender: "Priya Raghavan",
          subject,
          preview: `About ${subject}.`,
          important: true,
          label: "Work",
          receivedAt: null,
        },
      ],
    });

    await composeWithClaude(snapshot({ inbox: mail("Budget approval") }));
    expect(create).toHaveBeenCalledTimes(3);

    // Same unread count, different mail. The count alone would collide here,
    // and Miles would read out a briefing about the previous message.
    await composeWithClaude(snapshot({ inbox: mail("Contract ready for signature") }));
    expect(create).toHaveBeenCalledTimes(4);
  });

  it("asks with the system prompt that matches the mode", async () => {
    create.mockResolvedValue(reply("Good evening, Zach."));

    await composeWithClaude(snapshot(), "morning");
    await composeWithClaude(snapshot(), "evening");

    const [morning] = create.mock.calls[0];
    const [evening] = create.mock.calls[1];
    expect(morning.system).toContain("morning briefing");
    expect(evening.system).not.toBe(morning.system);
    expect(evening.messages[0].content).toContain("evening wind-down");
  });
});
