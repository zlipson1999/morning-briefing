import { describe, expect, it } from "vitest";
import { deterministicProposal, mightRequestAction, validProposal } from "@/lib/actions";

describe("Miles actions", () => {
  it("only invokes classification for action-shaped requests", () => {
    expect(mightRequestAction("Schedule lunch tomorrow at noon")).toBe(true);
    expect(mightRequestAction("What is on my schedule?")).toBe(false);
  });

  it("accepts a complete action proposal", () => {
    expect(validProposal({
      summary: "Add Buy milk to Google Tasks.",
      action: { kind: "task.create", title: "Buy milk" },
    })).toEqual({
      summary: "Add Buy milk to Google Tasks.",
      action: { kind: "task.create", title: "Buy milk" },
    });
  });

  it("rejects invented incomplete mutations", () => {
    expect(validProposal({ summary: "Complete it", action: { kind: "task.complete", title: "It" } })).toBeNull();
    expect(validProposal({ summary: "Unknown", action: { kind: "filesystem.delete", path: "/" } })).toBeNull();
  });

  it("proposes common task and watchlist commands without a model round trip", () => {
    expect(deterministicProposal("Add buy milk to my task list")?.action).toEqual({ kind: "task.create", title: "buy milk" });
    expect(deterministicProposal("remove NVDA from my watchlist")?.action).toEqual({ kind: "watchlist.remove", symbol: "NVDA" });
  });

  it("requires confirmation before remembering or forgetting personal context", () => {
    expect(deterministicProposal("Remember that my dentist is Dr. Smith")?.action).toEqual({
      kind: "memory.remember",
      text: "my dentist is Dr. Smith",
    });
    expect(deterministicProposal("Forget about my dentist")?.action).toEqual({
      kind: "memory.forget",
      query: "my dentist",
    });
  });
});

