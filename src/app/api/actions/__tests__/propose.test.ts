import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetSealingKey, unseal } from "@/lib/seal";
import type { ActionProposal } from "@/lib/actions";

/**
 * The other half of the boundary guarded in execute.test.ts.
 *
 * That route refuses to act on anything it did not seal; this one is the only
 * thing that seals. So what matters here is not the classifier's taste but
 * what it is willing to mint: never a confirmation without a proposal, never a
 * proposal the executor would refuse, and never one without an expiry.
 */

const gatherSnapshot = vi.fn();
vi.mock("@/lib/briefing/snapshot", () => ({ gatherSnapshot }));

const { POST } = await import("@/app/api/actions/propose/route");

type Minted = { proposal: ActionProposal | null; confirmation: string | null };

function post(body: unknown): Promise<Minted> {
  return POST(new Request("http://localhost:3000/api/actions/propose", {
    method: "POST",
    body: JSON.stringify(body),
  })).then((response) => response.json());
}

/** The model answers with whatever `content` is given, Ollama-shaped. */
function model(content: string) {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ message: { content } }), { status: 200 })));
}

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "a-test-secret-long-enough");
  resetSealingKey();
  gatherSnapshot.mockResolvedValue(null);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetSealingKey();
});

describe("POST /api/actions/propose", () => {
  it("answers an empty question without minting anything", async () => {
    vi.stubGlobal("fetch", vi.fn());

    expect(await post({ question: "   " })).toEqual({ proposal: null });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("recognises a plain command without paying for a model round trip", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const result = await post({ question: "Add buy milk to my task list" });

    expect(result.proposal?.action).toEqual({ kind: "task.create", title: "buy milk" });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  /** The executor trusts the seal, so what goes inside it has to be right. */
  it("mints a confirmation that carries the proposal and an expiry", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const before = Date.now();

    const result = await post({ question: "Add buy milk to my task list" });
    const opened = unseal<{ proposal: ActionProposal; expiresAt: number }>(result.confirmation);

    expect(opened?.proposal).toEqual(result.proposal);
    expect(opened?.expiresAt).toBeGreaterThan(before);
    expect(opened?.expiresAt).toBeLessThanOrEqual(before + 10 * 60_000 + 1_000);
  });

  it("seals a proposal the model returns", async () => {
    model(JSON.stringify({
      proposal: {
        summary: "Add Dentist to the calendar.",
        action: {
          kind: "calendar.create",
          title: "Dentist",
          start: "2026-08-24T15:00:00.000Z",
          end: "2026-08-24T15:30:00.000Z",
        },
      },
    }));

    const result = await post({ question: "Book the dentist Monday at 11" });

    expect(result.proposal?.action.kind).toBe("calendar.create");
    expect(unseal<{ proposal: ActionProposal }>(result.confirmation)?.proposal).toEqual(result.proposal);
  });

  /**
   * Anything the executor would refuse must never be sealed in the first
   * place: a confirmation is a promise that the thing inside it is valid.
   */
  it("refuses to seal what the executor would reject", async () => {
    for (const content of [
      // An action Miles does not support.
      JSON.stringify({ proposal: { summary: "Delete it all", action: { kind: "filesystem.delete", path: "/" } } }),
      // A supported kind missing the id it must never invent.
      JSON.stringify({ proposal: { summary: "Complete it", action: { kind: "task.complete", title: "It" } } }),
      // The model deciding this is not an action at all.
      JSON.stringify({ proposal: null }),
      // Not JSON.
      "I'm afraid I can't do that.",
    ]) {
      model(content);
      const result = await post({ question: "Clear my whole calendar please" });

      expect(result.proposal).toBeNull();
      // Absent or null: what matters is that it is not a usable confirmation,
      // which is exactly the test the browser applies before offering a card.
      expect(typeof result.confirmation).not.toBe("string");
    }
  });

  it("stays quiet when the classifier itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    expect(await post({ question: "Clear my calendar" })).toEqual({ proposal: null });

    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Ollama is not running"); }));
    expect(await post({ question: "Clear my calendar" })).toEqual({ proposal: null });
  });

  it("classifies even when the snapshot is unavailable", async () => {
    gatherSnapshot.mockRejectedValue(new Error("every provider is down"));
    model(JSON.stringify({ proposal: { summary: "Watch NVDA.", action: { kind: "watchlist.add", symbol: "NVDA" } } }));

    const result = await post({ question: "Watch NVDA for me" });
    expect(result.proposal?.action).toEqual({ kind: "watchlist.add", symbol: "NVDA" });
  });
});
