import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetSealingKey, seal } from "@/lib/seal";
import type { MilesAction } from "@/lib/actions";

/**
 * The one route that reaches out and changes something in the world.
 *
 * Everything else in Miles reads. This writes to Google Calendar and Google
 * Tasks, and it is reachable from the chat box, so its guard chain is the
 * app's security boundary: a request may only act if it carries a payload
 * this server sealed, that has not expired, and that describes a supported
 * action. Each of those three is load-bearing on its own.
 */

const createGoogleCalendarEvent = vi.fn();
const createGoogleTask = vi.fn();
const completeGoogleTask = vi.fn();
const updateWatchlist = vi.fn();
const remember = vi.fn();
const forget = vi.fn();

vi.mock("@/lib/providers/google/calendar", () => ({ createGoogleCalendarEvent }));
vi.mock("@/lib/providers/google/tasks", () => ({ createGoogleTask, completeGoogleTask }));
vi.mock("@/lib/watchlist", () => ({ updateWatchlist }));
vi.mock("@/lib/memory", () => ({ remember, forget }));

const { POST } = await import("@/app/api/actions/execute/route");

const TEN_MINUTES = 10 * 60_000;

function post(body: unknown) {
  return POST(new Request("http://localhost:3000/api/actions/execute", {
    method: "POST",
    body: JSON.stringify(body),
  }));
}

/** A confirmation exactly as the propose route mints one. */
function confirmationFor(action: MilesAction, expiresAt = Date.now() + TEN_MINUTES) {
  return seal({ proposal: { summary: "Do the thing.", action }, expiresAt });
}

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "a-test-secret-long-enough");
  resetSealingKey();
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  resetSealingKey();
});

const wrote = () =>
  createGoogleCalendarEvent.mock.calls.length +
  createGoogleTask.mock.calls.length +
  completeGoogleTask.mock.calls.length +
  updateWatchlist.mock.calls.length +
  remember.mock.calls.length +
  forget.mock.calls.length;

describe("POST /api/actions/execute", () => {
  it("performs a confirmed action", async () => {
    const response = await post({
      confirmation: confirmationFor({ kind: "task.create", title: "Call the roofer" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(createGoogleTask).toHaveBeenCalledWith({ kind: "task.create", title: "Call the roofer" });
  });

  /**
   * The important one: a payload this server never sealed must not act, no
   * matter how well-formed the action inside it looks.
   */
  it("refuses anything it did not seal itself", async () => {
    const action: MilesAction = { kind: "task.create", title: "Not authorised" };
    const genuine = confirmationFor(action);

    const forgeries = [
      // Plain JSON, as though sealing were merely an encoding.
      Buffer.from(JSON.stringify({ proposal: { summary: "x", action }, expiresAt: Date.now() + TEN_MINUTES })).toString("base64url"),
      // A real confirmation with a flipped byte: authentication must reject it.
      (() => {
        const raw = Buffer.from(genuine, "base64url");
        raw[raw.length - 1] ^= 0xff;
        return raw.toString("base64url");
      })(),
      // Sealed under a different key, i.e. a different server.
      (() => {
        vi.stubEnv("SESSION_SECRET", "a-completely-different-secret");
        resetSealingKey();
        const other = confirmationFor(action);
        vi.stubEnv("SESSION_SECRET", "a-test-secret-long-enough");
        resetSealingKey();
        return other;
      })(),
      "",
      "not-base64url-at-all!!",
    ];

    for (const confirmation of forgeries) {
      const response = await post({ confirmation });
      expect(response.status).toBe(400);
    }
    expect(wrote()).toBe(0);
  });

  it("refuses a confirmation that has expired", async () => {
    const response = await post({
      confirmation: confirmationFor({ kind: "task.create", title: "Stale" }, Date.now() - 1),
    });

    expect(response.status).toBe(400);
    expect(wrote()).toBe(0);
  });

  it("refuses a sealed action it does not support, or one missing its details", async () => {
    // Sealed by us, unexpired — and still not something Miles will do.
    const invented = seal({
      proposal: { summary: "Delete everything.", action: { kind: "filesystem.delete", path: "/" } },
      expiresAt: Date.now() + TEN_MINUTES,
    });
    expect((await post({ confirmation: invented })).status).toBe(400);

    // A supported kind whose required id is absent: never invent one.
    const incomplete = seal({
      proposal: { summary: "Complete it.", action: { kind: "task.complete", title: "It" } },
      expiresAt: Date.now() + TEN_MINUTES,
    });
    expect((await post({ confirmation: incomplete })).status).toBe(400);

    expect(wrote()).toBe(0);
  });

  it("refuses a request carrying no confirmation at all", async () => {
    expect((await post({}).then((r) => r.status))).toBe(400);
    expect((await post({ confirmation: { not: "a string" } }).then((r) => r.status))).toBe(400);
    expect(wrote()).toBe(0);
  });

  /** Gmail is read-only: dismissing is Miles' own view, never a mailbox write. */
  it("dismisses mail locally, handing the id back to the browser", async () => {
    const response = await post({
      confirmation: confirmationFor({
        kind: "email.dismiss",
        messageId: "msg-42",
        title: "Budget approval",
      }),
    });

    expect(await response.json()).toEqual({
      ok: true,
      clientAction: { kind: "email.dismiss", id: "msg-42" },
    });
    expect(wrote()).toBe(0);
  });

  it("reports a provider failure as a bad gateway rather than crashing", async () => {
    createGoogleCalendarEvent.mockRejectedValue(new Error("Reconnect Google to grant access."));

    const response = await post({
      confirmation: confirmationFor({
        kind: "calendar.create",
        title: "Dentist",
        start: "2026-08-24T15:00:00.000Z",
        end: "2026-08-24T15:30:00.000Z",
      }),
    });

    expect(response.status).toBe(502);
    expect((await response.json()).error.message).toBe("Reconnect Google to grant access.");
  });

  it("routes each supported action to its own provider", async () => {
    await post({ confirmation: confirmationFor({ kind: "watchlist.add", symbol: "NVDA" }) });
    expect(updateWatchlist).toHaveBeenCalledWith("NVDA", "add");

    await post({ confirmation: confirmationFor({ kind: "watchlist.remove", symbol: "NVDA" }) });
    expect(updateWatchlist).toHaveBeenCalledWith("NVDA", "remove");

    await post({ confirmation: confirmationFor({ kind: "memory.remember", text: "dentist is Dr. Smith" }) });
    expect(remember).toHaveBeenCalledWith("dentist is Dr. Smith");

    await post({ confirmation: confirmationFor({ kind: "memory.forget", query: "dentist" }) });
    expect(forget).toHaveBeenCalledWith("dentist");

    await post({ confirmation: confirmationFor({ kind: "task.complete", taskId: "t-1", title: "Roof" }) });
    expect(completeGoogleTask).toHaveBeenCalledWith("t-1");
  });
});
