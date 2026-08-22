import { describe, expect, it } from "vitest";
import { matchWakeWord } from "@/hooks/useWakeWord";
import { interpretWakeCommand } from "@/lib/wakeCommands";

/**
 * The wake word is matched against speech recognition output, which is
 * lowercase-ish, comma-happy and frequently slightly wrong — so the matcher
 * is tested against what recognition actually produces, not clean prose.
 */
describe("matchWakeWord", () => {
  it("matches the canonical greeting and hands back the command", () => {
    expect(matchWakeWord("hey miles")).toBe("");
    expect(matchWakeWord("Hey Miles, what's next")).toBe("what's next");
    expect(matchWakeWord("hey, Miles what now")).toBe("what now");
  });

  it("accepts the name alone and the other greetings", () => {
    expect(matchWakeWord("miles")).toBe("");
    expect(matchWakeWord("Miles, full briefing")).toBe("full briefing");
    expect(matchWakeWord("okay miles stop")).toBe("stop");
    expect(matchWakeWord("hi miles")).toBe("");
  });

  it("finds the greeting mid-utterance, since recognition merges sentences", () => {
    expect(matchWakeWord("um so hey miles what's my day look like")).toBe("what's my day look like");
  });

  it("ignores speech that merely contains the name", () => {
    expect(matchWakeWord("it's about forty miles away")).toBeNull();
    expect(matchWakeWord("the miles add up")).toBeNull();
    expect(matchWakeWord("smiles all around")).toBeNull();
    expect(matchWakeWord("")).toBeNull();
  });

  it("follows a renamed assistant", () => {
    expect(matchWakeWord("hey jarvis status", "Jarvis")).toBe("status");
    expect(matchWakeWord("hey miles status", "Jarvis")).toBeNull();
  });
});

describe("interpretWakeCommand", () => {
  /** Only a bare "Hey Miles" — nothing after the name — means the update. */
  it("gives the short update only for a bare greeting or a literal ask for one", () => {
    expect(interpretWakeCommand("")).toEqual({ kind: "speak", mode: "now" });
    expect(interpretWakeCommand("update me")).toEqual({ kind: "speak", mode: "now" });
    expect(interpretWakeCommand("what's up")).toEqual({ kind: "speak", mode: "now" });
    expect(interpretWakeCommand("status")).toEqual({ kind: "speak", mode: "now" });
  });

  it("recognises a request for the whole thing", () => {
    expect(interpretWakeCommand("full briefing")).toEqual({ kind: "speak", mode: "morning" });
    expect(interpretWakeCommand("give me the morning briefing again")).toEqual({
      kind: "speak",
      mode: "morning",
    });
    expect(interpretWakeCommand("start over")).toEqual({ kind: "speak", mode: "morning" });
  });

  it("recognises goodnight as the evening wind-down", () => {
    expect(interpretWakeCommand("goodnight")).toEqual({ kind: "speak", mode: "evening" });
    expect(interpretWakeCommand("good night miles")).toEqual({ kind: "speak", mode: "evening" });
    expect(interpretWakeCommand("how did today go")).toEqual({ kind: "speak", mode: "evening" });
    expect(interpretWakeCommand("wrap up the day")).toEqual({ kind: "speak", mode: "evening" });
  });

  it("recognises a request for the week ahead", () => {
    expect(interpretWakeCommand("week ahead")).toEqual({ kind: "week" });
    expect(interpretWakeCommand("what's my week look like")).toEqual({ kind: "week" });
    expect(interpretWakeCommand("this week")).toEqual({ kind: "week" });
  });

  it("stops on being told to", () => {
    expect(interpretWakeCommand("stop")).toEqual({ kind: "stop" });
    expect(interpretWakeCommand("be quiet")).toEqual({ kind: "stop" });
    expect(interpretWakeCommand("never mind")).toEqual({ kind: "stop" });
  });

  it("tells mute and unmute apart", () => {
    expect(interpretWakeCommand("mute")).toEqual({ kind: "mute" });
    expect(interpretWakeCommand("unmute")).toEqual({ kind: "unmute" });
    expect(interpretWakeCommand("voice off")).toEqual({ kind: "mute" });
  });

  /**
   * The core of "ask Miles anything": anything with real content that isn't
   * one of the recognised intents becomes a question, not a shrug into "now".
   */
  it("treats any other real content as a question", () => {
    expect(interpretWakeCommand("what's next")).toEqual({ kind: "ask", question: "what's next" });
    expect(interpretWakeCommand("how's NVDA doing")).toEqual({
      kind: "ask",
      question: "how's NVDA doing",
    });
    expect(interpretWakeCommand("when's my next meeting with Sofia")).toEqual({
      kind: "ask",
      question: "when's my next meeting with Sofia",
    });
  });

  it("preserves the original casing and punctuation of a question", () => {
    expect(interpretWakeCommand("How's NVDA Doing?")).toEqual({
      kind: "ask",
      question: "How's NVDA Doing?",
    });
  });
});
