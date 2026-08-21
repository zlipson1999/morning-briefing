import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The store path is read at module load, so each case gets a fresh temp file
 * and a fresh import of the module under test.
 */
let dir: string;

async function loadStore() {
  vi.resetModules();
  return import("@/lib/calendar/store");
}

async function loadCalendar() {
  vi.resetModules();
  return import("@/lib/calendar");
}

function event(overrides: Record<string, unknown> = {}) {
  const start = new Date();
  start.setHours(11, 0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60_000);

  return {
    id: "e1",
    title: "Design review",
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    location: "500 S Australian Ave, West Palm Beach, FL",
    address: "500 S Australian Ave, West Palm Beach, FL",
    attendees: ["Sofia L."],
    kind: "meeting" as const,
    allDay: false,
    cancelled: false,
    updatedAt: Date.now(),
    ...overrides,
  };
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "mb-calendar-"));
  vi.stubEnv("CALENDAR_STORE", path.join(dir, "calendar.json"));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.resetModules();
  await fs.rm(dir, { recursive: true, force: true });
});

describe("the calendar store", () => {
  it("reads as empty before anything has been pushed", async () => {
    const { readStore } = await loadStore();
    expect(await readStore()).toEqual({ events: {}, updatedAt: 0 });
  });

  it("survives a restart", async () => {
    const first = await loadStore();
    await first.upsertEvents([event()]);

    // A fresh import is a fresh process, as far as this module is concerned.
    const second = await loadStore();
    expect(Object.keys((await second.readStore()).events)).toEqual(["e1"]);
  });

  it("upserts by id rather than appending duplicates", async () => {
    const { upsertEvents, readStore } = await loadStore();

    await upsertEvents([event()]);
    await upsertEvents([event({ title: "Design review (moved)" })]);

    const store = await readStore();
    expect(Object.keys(store.events)).toHaveLength(1);
    expect(store.events.e1.title).toBe("Design review (moved)");
  });

  /** A Zap can fire several events at once; none of them may be lost. */
  it("does not lose writes that arrive together", async () => {
    const { upsertEvents, readStore } = await loadStore();

    await Promise.all([
      upsertEvents([event({ id: "a" })]),
      upsertEvents([event({ id: "b" })]),
      upsertEvents([event({ id: "c" })]),
    ]);

    expect(Object.keys((await readStore()).events).sort()).toEqual(["a", "b", "c"]);
  });

  it("drops a cancelled event instead of storing it", async () => {
    const { upsertEvents, readStore } = await loadStore();

    await upsertEvents([event()]);
    await upsertEvents([event({ cancelled: true })]);
    expect((await readStore()).events).toEqual({});
  });

  it("forgets events more than a couple of days old", async () => {
    const { upsertEvents, readStore } = await loadStore();
    const longAgo = new Date(Date.now() - 5 * 24 * 60 * 60_000).toISOString();

    await upsertEvents([event({ id: "old", startIso: longAgo, endIso: longAgo }), event()]);
    expect(Object.keys((await readStore()).events)).toEqual(["e1"]);
  });

  it("removes by id and reports whether anything was there", async () => {
    const { upsertEvents, removeEvent } = await loadStore();

    await upsertEvents([event()]);
    expect(await removeEvent("e1")).toBe(true);
    expect(await removeEvent("e1")).toBe(false);
  });
});

describe("getTodaysCalendar", () => {
  it("falls back to the sample day so a fresh clone still works", async () => {
    const { getTodaysCalendar } = await loadCalendar();
    const calendar = await getTodaysCalendar();

    expect(calendar.source).toBe("sample");
    expect(calendar.events.length).toBeGreaterThan(0);
    expect(calendar.syncedAt).toBeNull();
  });

  it("uses the pushed calendar once anything has arrived", async () => {
    const { upsertEvents, getTodaysCalendar } = await loadCalendar();
    await upsertEvents([event()]);

    const calendar = await getTodaysCalendar();
    expect(calendar.source).toBe("zapier");
    expect(calendar.events).toHaveLength(1);
    expect(calendar.events[0]).toMatchObject({ title: "Design review", start: "11:00", end: "12:00" });
    expect(calendar.syncedAt).toBeGreaterThan(0);
  });

  it("shows only today, and in time order", async () => {
    const { upsertEvents, getTodaysCalendar } = await loadCalendar();

    const later = new Date();
    later.setHours(15, 30, 0, 0);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60_000);
    tomorrow.setHours(9, 0, 0, 0);

    await upsertEvents([
      event({ id: "late", title: "1:1", startIso: later.toISOString(), endIso: later.toISOString() }),
      event(),
      event({ id: "tmrw", title: "Tomorrow", startIso: tomorrow.toISOString(), endIso: tomorrow.toISOString() }),
    ]);

    const calendar = await getTodaysCalendar();
    expect(calendar.events.map((e) => e.title)).toEqual(["Design review", "1:1"]);
  });

  it("carries the address through, which is what makes leave-by possible", async () => {
    const { upsertEvents, getTodaysCalendar } = await loadCalendar();
    await upsertEvents([event()]);

    expect((await getTodaysCalendar()).events[0].address).toContain("Australian Ave");
  });

  it("reports an empty real calendar as empty, not as the sample day", async () => {
    const { upsertEvents, getTodaysCalendar } = await loadCalendar();
    const tomorrow = new Date(Date.now() + 24 * 60 * 60_000);
    tomorrow.setHours(9, 0, 0, 0);

    await upsertEvents([event({ id: "tmrw", startIso: tomorrow.toISOString(), endIso: tomorrow.toISOString() })]);

    const calendar = await getTodaysCalendar();
    expect(calendar.source).toBe("zapier");
    expect(calendar.events).toEqual([]);
  });
});
