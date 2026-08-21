import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeMailPayload, normalizeMessage, splitSender } from "@/lib/mail/normalize";

let dir: string;

async function loadMail() {
  vi.resetModules();
  return import("@/lib/mail");
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "mb-mail-"));
  vi.stubEnv("MAIL_STORE", path.join(dir, "mail.json"));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.resetModules();
  await fs.rm(dir, { recursive: true, force: true });
});

describe("splitSender", () => {
  it("pulls the name out of a raw From header", () => {
    expect(splitSender("Priya Raghavan <priya@nimbus.dev>")).toEqual({
      name: "Priya Raghavan",
      email: "priya@nimbus.dev",
    });
    expect(splitSender('"Sofia Lindqvist" <sofia@nimbus.dev>').name).toBe("Sofia Lindqvist");
  });

  it("makes a bare address readable", () => {
    expect(splitSender("marcus.delgado@nimbus.dev")).toEqual({
      name: "marcus delgado",
      email: "marcus.delgado@nimbus.dev",
    });
  });

  it("takes a bare name as a name", () => {
    expect(splitSender("GitHub")).toEqual({ name: "GitHub", email: "" });
  });
});

describe("normalizeMessage", () => {
  it("reads Zapier's flattened Gmail shape", () => {
    const message = normalizeMessage({
      id: "m1",
      from__name: "Priya Raghavan",
      from__email: "priya@nimbus.dev",
      subject: "Re: latency numbers",
      snippet: "p95 dropped to 180ms",
      date: "2026-08-21T06:42:00-04:00",
      is_important: "yes",
      attachment_count: 2,
    });

    expect(message).toMatchObject({
      id: "m1",
      sender: "Priya Raghavan",
      senderEmail: "priya@nimbus.dev",
      subject: "Re: latency numbers",
      important: true,
      hasAttachment: true,
    });
  });

  it("reads a hand-built Zap that sends From as one string", () => {
    const message = normalizeMessage({
      from: "Sofia Lindqvist <sofia@nimbus.dev>",
      subject: "Deck for the 11am",
    });
    expect(message?.sender).toBe("Sofia Lindqvist");
    expect(message?.senderEmail).toBe("sofia@nimbus.dev");
  });

  it("spots an attachment from a count, a list, or a flag", () => {
    expect(normalizeMessage({ subject: "a", attachments: [{}] })?.hasAttachment).toBe(true);
    expect(normalizeMessage({ subject: "a", has_attachment: true })?.hasAttachment).toBe(true);
    expect(normalizeMessage({ subject: "a" })?.hasAttachment).toBe(false);
  });

  /** Gmail's own labels are plumbing; a briefing wants the meaningful one. */
  it("skips Gmail's structural labels when picking one to show", () => {
    expect(normalizeMessage({ subject: "a", labels: ["UNREAD", "INBOX", "Work"] })?.label).toBe("Work");
    expect(normalizeMessage({ subject: "a", labels: ["UNREAD"] })?.label).toBe("Inbox");
  });

  it("falls back to now rather than dropping a message with a bad date", () => {
    const message = normalizeMessage({ subject: "a", date: "not a date" });
    expect(Number.isNaN(Date.parse(message!.receivedIso))).toBe(false);
  });

  it("needs a subject or a sender, but not both", () => {
    expect(normalizeMessage({ subject: "Only a subject" })?.sender).toBe("Unknown sender");
    expect(normalizeMessage({ from: "Only a sender" })?.subject).toBe("(no subject)");
    expect(normalizeMessage({ date: "2026-08-21T06:42:00Z" })).toBeNull();
  });

  it("accepts a single message, a wrapped list, and a bare array", () => {
    expect(normalizeMailPayload({ subject: "a" })).toHaveLength(1);
    expect(normalizeMailPayload({ messages: [{ subject: "a" }, { subject: "b" }] })).toHaveLength(2);
    expect(normalizeMailPayload([{ subject: "a" }, null])).toHaveLength(1);
  });
});

describe("receivedLabelFor", () => {
  it("says today as a clock time and yesterday by name", async () => {
    const { receivedLabelFor } = await loadMail();
    const now = new Date(2026, 7, 21, 9, 0);

    expect(receivedLabelFor(new Date(2026, 7, 21, 6, 42).toISOString(), now)).toBe("6:42 AM");
    expect(receivedLabelFor(new Date(2026, 7, 20, 21, 7).toISOString(), now)).toBe("Yesterday 9:07 PM");
    expect(receivedLabelFor(new Date(2026, 7, 18, 9, 0).toISOString(), now)).toBe("Aug 18");
  });
});

describe("getInbox", () => {
  const message = (overrides: Record<string, unknown> = {}) => ({
    id: "m1",
    sender: "Priya Raghavan",
    senderEmail: "priya@nimbus.dev",
    subject: "Re: latency numbers",
    preview: "p95 dropped",
    receivedIso: new Date().toISOString(),
    important: true,
    hasAttachment: false,
    label: "Work",
    updatedAt: Date.now(),
    ...overrides,
  });

  it("falls back to the sample inbox so a fresh clone still works", async () => {
    const { getInbox } = await loadMail();
    const inbox = await getInbox();

    expect(inbox.source).toBe("sample");
    expect(inbox.messages.length).toBeGreaterThan(0);
    expect(inbox.messages[0].receivedLabel).toBeTruthy();
  });

  it("uses the pushed inbox once anything arrives, newest first", async () => {
    const { upsertMessages, getInbox } = await loadMail();

    await upsertMessages([
      message({ id: "old", subject: "Older", receivedIso: new Date(Date.now() - 3_600_000).toISOString() }),
      message({ id: "new", subject: "Newer" }),
    ]);

    const inbox = await getInbox();
    expect(inbox.source).toBe("zapier");
    expect(inbox.messages.map((m) => m.subject)).toEqual(["Newer", "Older"]);
  });

  it("forgets mail older than a week", async () => {
    const { upsertMessages, getInbox } = await loadMail();
    const ancient = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();

    await upsertMessages([message({ id: "ancient", receivedIso: ancient }), message()]);
    expect((await getInbox()).messages.map((m) => m.id)).toEqual(["m1"]);
  });
});
