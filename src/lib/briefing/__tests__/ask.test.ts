import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askIsConfigured, composeAnswer } from "@/lib/briefing/ask";
import type { BriefingSnapshot } from "@/lib/briefing/snapshot";

function snapshot(overrides: Partial<BriefingSnapshot> = {}): BriefingSnapshot {
  return {
    userName: "Zach",
    now: { weekday: "Friday", date: "August 21", time: "7:15 AM", hour: 7, minutes: 435 },
    weather: null,
    schedule: { remaining: 0, total: 0, events: [], freeWindows: [], conflicts: [] },
    inbox: { unread: 0, messages: [] },
    tasks: { open: 0, done: 0, items: [] },
    portfolio: null,
    news: { local: [], global: [], curatedLocal: false },
    commute: null,
    packages: [],
    tomorrow: null,
    ...overrides,
  };
}

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

describe("askIsConfigured", () => {
  it("follows the same key as the rest of the briefing", () => {
    expect(askIsConfigured()).toBe(true);
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(askIsConfigured()).toBe(false);
  });
});

describe("composeAnswer", () => {
  it("answers from Claude when configured", async () => {
    fake = replyWith("Your next thing is Design review at 11am.");
    const answer = await composeAnswer(snapshot(), "what's next");
    expect(answer).toBe("Your next thing is Design review at 11am.");
  });

  it("says plainly when there's no question, without calling Claude", async () => {
    fake = replyWith("should never be reached");
    expect(await composeAnswer(snapshot(), "")).toMatch(/didn't catch a question/i);
    expect(await composeAnswer(snapshot(), "   ")).toMatch(/didn't catch a question/i);
    expect(fake.messages.create).not.toHaveBeenCalled();
  });

  it("says honestly that it needs a key, rather than guessing at an answer", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const answer = await composeAnswer(snapshot(), "how's NVDA doing");
    expect(answer).toMatch(/claude key/i);
  });

  it("falls back to a spoken apology when the call throws", async () => {
    fake = { messages: { create: vi.fn(async () => { throw new Error("network"); }) } } as never;
    const answer = await composeAnswer(snapshot(), "what's next");
    expect(answer).toMatch(/couldn't work that out/i);
  });

  it("falls back when the model refuses", async () => {
    fake = {
      messages: {
        create: vi.fn(async () => ({ stop_reason: "refusal", content: [], stop_details: { category: "x" } })),
      },
    } as never;
    expect(await composeAnswer(snapshot(), "what's next")).toMatch(/couldn't work that out/i);
  });

  it("passes the question and the snapshot to the model", async () => {
    fake = replyWith("Sure.");
    await composeAnswer(
      snapshot({ portfolio: { connected: true, mode: "live", totalValue: 1, dayChangePct: 1, movers: [] } }),
      "how's my portfolio",
    );

    const [call] = fake.messages.create.mock.calls[0] as unknown as [{ messages: { content: string }[] }];
    expect(call.messages[0].content).toContain("how's my portfolio");
    expect(call.messages[0].content).toContain("\"totalValue\": 1");
  });
});
