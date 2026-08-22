import { describe, expect, it } from "vitest";
import { deterministicProposal, mightRequestAction, validProposal } from "@/lib/actions";

describe("Miles actions", () => {
  it("only invokes classification for action-shaped requests", () => {
    expect(mightRequestAction("Schedule lunch tomorrow at noon")).toBe(true);
    expect(mightRequestAction("What is on my schedule?")).toBe(false);
  });

  it("reads past ordinary politeness to find the command", () => {
    expect(mightRequestAction("Can you add buy milk to my task list?")).toBe(true);
    expect(mightRequestAction("Miles, please remember that my dentist is Dr. Smith")).toBe(true);
  });

  it("leaves a question alone when it merely mentions an action verb", () => {
    expect(mightRequestAction("What should I watch tonight?")).toBe(false);
    expect(mightRequestAction("Did Priya finish the budget?")).toBe(false);
    expect(mightRequestAction("Why does my calendar look so clear today?")).toBe(false);
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
    expect(deterministicProposal("Add a task to call the roofer")?.action).toEqual({ kind: "task.create", title: "call the roofer" });
    expect(deterministicProposal("Create task: renew the registration")?.action).toEqual({
      kind: "task.create",
      title: "renew the registration",
    });
  });

  it("does not turn ordinary creative requests into a task card", () => {
    expect(deterministicProposal("Create a poem about the sea")).toBeNull();
    expect(deterministicProposal("Add some context about the Fed decision")).toBeNull();
  });

  it("does not treat a question about the past as a memory command", () => {
    expect(deterministicProposal("Remember when I told you about the roofer?")).toBeNull();
    expect(deterministicProposal("Remember what Priya said")).toBeNull();
    expect(deterministicProposal("Forget about the roofer?")).toBeNull();
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

