import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let dir: string;

async function loadWeek() {
  vi.resetModules();
  return import("@/lib/briefing/week");
}

async function loadCalendar() {
  vi.resetModules();
  return import("@/lib/calendar");
}

function event(dayOffset: number, hour: number, overrides: Record<string, unknown> = {}) {
  const start = new Date();
  start.setDate(start.getDate() + dayOffset);
  start.setHours(hour, 0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60_000);

  return {
    id: `e${dayOffset}-${hour}-${Math.random()}`,
    title: "Event",
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    location: "Zoom",
    attendees: [],
    kind: "meeting" as const,
    allDay: false,
    cancelled: false,
    updatedAt: Date.now(),
    ...overrides,
  };
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "mb-week-"));
  vi.stubEnv("CALENDAR_STORE", path.join(dir, "calendar.json"));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.resetModules();
  await fs.rm(dir, { recursive: true, force: true });
});

describe("gatherWeek", () => {
  it("counts events per day across the coming week", async () => {
    const { upsertEvents } = await loadCalendar();
    await upsertEvents([
      event(0, 9, { title: "Today's only meeting" }),
      event(2, 9), event(2, 11), event(2, 14), event(2, 16), event(2, 18), // busy
    ]);

    const { gatherWeek } = await loadWeek();
    const days = await gatherWeek(new Date());

    expect(days).toHaveLength(7);
    expect(days[0].count).toBe(1);
    expect(days[0].density).toBe("moderate");
    expect(days[0].firstEvent).toBe("Today's only meeting");
    expect(days[2].count).toBe(5);
    expect(days[2].density).toBe("busy");
  });

  it("calls a day with nothing on it light", async () => {
    // An empty store falls back to the sample day, which isn't what this
    // case is testing — push one event, far enough out that six of the
    // seven days in range are still genuinely empty.
    const { upsertEvents } = await loadCalendar();
    await upsertEvents([event(6, 9, { title: "Only thing all week" })]);

    const { gatherWeek } = await loadWeek();
    const days = await gatherWeek(new Date());

    expect(days.slice(0, 6).every((d) => d.density === "light" && d.count === 0)).toBe(true);
    expect(days[6]).toMatchObject({ count: 1, density: "moderate", firstEvent: "Only thing all week" });
  });

  it("names the actual weekday and date for each day", async () => {
    await loadCalendar();
    const { gatherWeek } = await loadWeek();
    const now = new Date(2026, 7, 21); // a Friday
    const days = await gatherWeek(now);

    expect(days[0].weekday).toBe("Friday");
    expect(days[1].weekday).toBe("Saturday");
    expect(days[0].date).toBe("Aug 21");
  });
});

describe("composeWeek", () => {
  it("says nothing to look ahead in when there are no days", async () => {
    const { composeWeek } = await loadWeek();
    expect(composeWeek([])).toMatch(/don't have a calendar/i);
  });

  it("summarises each day's count in order", async () => {
    const { composeWeek } = await loadWeek();
    const text = composeWeek([
      { weekday: "Monday", date: "Aug 24", count: 0, density: "light", firstEvent: null },
      { weekday: "Tuesday", date: "Aug 25", count: 2, density: "moderate", firstEvent: "Standup" },
    ]);
    expect(text).toContain("Monday is clear");
    expect(text).toContain("Tuesday has 2 events");
  });

  it("calls out the heaviest and lightest days", async () => {
    const { composeWeek } = await loadWeek();
    const text = composeWeek([
      { weekday: "Monday", date: "Aug 24", count: 0, density: "light", firstEvent: null },
      { weekday: "Tuesday", date: "Aug 25", count: 6, density: "busy", firstEvent: "A" },
      { weekday: "Wednesday", date: "Aug 26", count: 1, density: "moderate", firstEvent: "B" },
    ]);
    expect(text).toContain("Tuesday is your heaviest day");
    expect(text).toContain("Monday is wide open");
  });

  it("joins more than one heavy day with commas and 'and'", async () => {
    const { composeWeek } = await loadWeek();
    const text = composeWeek([
      { weekday: "Monday", date: "a", count: 5, density: "busy", firstEvent: null },
      { weekday: "Tuesday", date: "b", count: 5, density: "busy", firstEvent: null },
      { weekday: "Wednesday", date: "c", count: 5, density: "busy", firstEvent: null },
    ]);
    expect(text).toContain("Monday, Tuesday, and Wednesday are your heaviest days.");
  });
});
