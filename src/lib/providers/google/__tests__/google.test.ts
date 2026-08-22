import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCache } from "@/lib/cache";
import { mapGoogleEvent } from "@/lib/providers/google/calendar";
import { gmailSearch, mapGmailMessage } from "@/lib/providers/google/gmail";
import { mapGoogleTask } from "@/lib/providers/google/tasks";

const NOW = new Date(2026, 7, 21, 9, 0);
let dir: string;

async function loadAuth() {
  vi.resetModules();
  return import("@/lib/providers/google/auth");
}

beforeEach(async () => {
  clearCache();
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "mb-google-"));
  vi.stubEnv("GOOGLE_STORE", path.join(dir, "google.json"));
  vi.stubEnv("SESSION_SECRET", "a-long-enough-test-secret");
  vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
  clearCache();
  await fs.rm(dir, { recursive: true, force: true });
});

describe("mapGoogleEvent", () => {
  it("maps a timed event, address and attendees included", () => {
    const event = mapGoogleEvent({
      id: "e1",
      summary: "Design review",
      location: "500 S Australian Ave, West Palm Beach, FL 33401",
      start: { dateTime: "2026-08-21T11:00:00-04:00" },
      end: { dateTime: "2026-08-21T12:00:00-04:00" },
      attendees: [
        { displayName: "Sofia L.", email: "sofia@nimbus.dev" },
        { email: "me@zach.dev", self: true },
        { displayName: "Conf Rm 4B", resource: true },
      ],
    });

    expect(event).toMatchObject({
      id: "e1",
      title: "Design review",
      address: "500 S Australian Ave, West Palm Beach, FL 33401",
      attendees: ["Sofia L."],
      kind: "meeting",
    });
    // Wall clock in the server's zone — hours depend on the runner, so
    // assert shape rather than a specific hour.
    expect(event?.start).toMatch(/^\d{2}:\d{2}$/);
  });

  it("treats a bare date as an all-day event spanning the day", () => {
    const event = mapGoogleEvent({ id: "e2", summary: "Birthday", start: { date: "2026-08-21" } });
    expect(event).toMatchObject({ start: "00:00", end: "23:59", location: "All day" });
  });

  it("drops cancelled and titleless entries", () => {
    expect(mapGoogleEvent({ id: "x", summary: "Gone", status: "cancelled", start: { dateTime: "2026-08-21T09:00:00Z" } })).toBeNull();
    expect(mapGoogleEvent({ id: "y", start: { dateTime: "2026-08-21T09:00:00Z" } })).toBeNull();
  });

  it("gives a Zoom room no address, keeping leave-by honest", () => {
    const event = mapGoogleEvent({
      id: "e3",
      summary: "Standup",
      location: "https://zoom.us/j/123",
      start: { dateTime: "2026-08-21T09:00:00-04:00" },
    });
    expect(event?.address).toBeUndefined();
  });
});

describe("mapGmailMessage", () => {
  const message = (over: Record<string, unknown> = {}) => ({
    id: "m1",
    snippet: "p95 dropped to 180ms",
    internalDate: String(NOW.getTime() - 30 * 60_000),
    labelIds: ["UNREAD", "IMPORTANT", "INBOX", "Work"],
    payload: {
      headers: [
        { name: "From", value: "Priya Raghavan <priya@nimbus.dev>" },
        { name: "Subject", value: "Re: latency numbers" },
      ],
    },
    ...over,
  });

  it("maps headers, importance and the human label", () => {
    expect(mapGmailMessage(message(), NOW)).toMatchObject({
      id: "m1",
      sender: "Priya Raghavan",
      senderEmail: "priya@nimbus.dev",
      subject: "Re: latency numbers",
      important: true,
      label: "Work",
    });
  });

  it("falls back to Inbox when only structural labels exist", () => {
    expect(mapGmailMessage(message({ labelIds: ["UNREAD", "CATEGORY_UPDATES"] }), NOW)?.label).toBe("Inbox");
  });

  it("rejects a message with neither sender nor subject", () => {
    expect(mapGmailMessage({ id: "m2", payload: { headers: [] } }, NOW)).toBeNull();
  });
});

describe("gmailSearch", () => {
  it("includes important mail and the AI Inbox label by default", () => {
    expect(gmailSearch()).toBe('is:unread newer_than:2d {is:important label:"AI Inbox"}');
  });

  it("allows the AI Inbox label or the entire search to be customized", () => {
    vi.stubEnv("GMAIL_AI_INBOX_LABEL", "Inbox/AI Inbox");
    expect(gmailSearch()).toContain('label:"Inbox/AI Inbox"');

    vi.stubEnv("GMAIL_SEARCH", 'label:"Miles" newer_than:7d');
    expect(gmailSearch()).toBe('label:"Miles" newer_than:7d');
  });
});

describe("mapGoogleTask", () => {
  it("reads Google's fake-midnight due date as end of the local day", () => {
    const task = mapGoogleTask(
      { id: "t1", title: "Renew the domain", due: "2026-08-21T00:00:00.000Z", status: "needsAction" },
      "Personal",
      NOW,
    );
    expect(task).toMatchObject({ project: "Personal", overdue: false, dueLabel: "Today" });
  });

  it("marks yesterday's unfinished work overdue, but never completed work", () => {
    const base = { id: "t2", title: "Merge the PR", due: "2026-08-20T00:00:00.000Z" };
    expect(mapGoogleTask({ ...base, status: "needsAction" }, "p", NOW)?.overdue).toBe(true);
    expect(mapGoogleTask({ ...base, status: "completed" }, "p", NOW)?.overdue).toBe(false);
  });

  it("drops the empty rows the Tasks API pads lists with", () => {
    expect(mapGoogleTask({ id: "t3", title: " " }, "p", NOW)).toBeNull();
  });
});

describe("the stored grant", () => {
  it("round-trips sealed and never plaintext on disk", async () => {
    const auth = await loadAuth();
    await auth.saveRefreshToken("1//refresh-token-value");

    expect(await auth.readRefreshToken()).toBe("1//refresh-token-value");
    const raw = await fs.readFile(path.join(dir, "google.json"), "utf8");
    expect(raw).not.toContain("refresh-token-value");
  });

  it("is connected only with both creds and a grant", async () => {
    const auth = await loadAuth();
    expect(await auth.googleIsConnected()).toBe(false);
    await auth.saveRefreshToken("1//tok");
    expect(await auth.googleIsConnected()).toBe(true);
    await auth.forgetGrant();
    expect(await auth.googleIsConnected()).toBe(false);
  });

  it("swaps the refresh token for an access token and caches it", async () => {
    const auth = await loadAuth();
    await auth.saveRefreshToken("1//tok");

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ access_token: "ya29.abc", expires_in: 3600 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(await auth.getAccessToken()).toBe("ya29.abc");
    expect(await auth.getAccessToken()).toBe("ya29.abc");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const body = String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body);
    expect(body).toContain("refresh_token=1%2F%2Ftok");
  });

  it("forgets a grant Google says was revoked", async () => {
    const auth = await loadAuth();
    await auth.saveRefreshToken("1//tok");
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }),
    ));

    expect(await auth.getAccessToken()).toBeNull();
    expect(await auth.readRefreshToken()).toBeNull();
  });
});

