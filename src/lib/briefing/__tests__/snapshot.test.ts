import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCache } from "@/lib/cache";
import { gatherSnapshot } from "@/lib/briefing/snapshot";

/**
 * Everything upstream is dead here on purpose: the snapshot has to come back
 * whole with only the local data filled in, because that is exactly the state
 * the briefing endpoint has to survive.
 */
beforeEach(() => {
  clearCache();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("upstream down", { status: 503 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearCache();
});

const at = (hours: number, minutes = 0) => new Date(2026, 7, 21, hours, minutes);

describe("gatherSnapshot", () => {
  it("survives every upstream failing", async () => {
    const snapshot = await gatherSnapshot({ now: at(7) });

    expect(snapshot.weather).toBeNull();
    expect(snapshot.commute).toBeNull();
    expect(snapshot.news).toEqual({ local: [], global: [] });
    expect(snapshot.schedule.total).toBeGreaterThan(0);
    expect(snapshot.tasks.open).toBeGreaterThan(0);
  });

  it("classifies events against the clock", async () => {
    const snapshot = await gatherSnapshot({ now: at(9, 45) });
    const byTitle = Object.fromEntries(snapshot.schedule.events.map((e) => [e.title, e.status]));

    expect(byTitle["Standup — Platform"]).toBe("past");
    expect(byTitle["Deep work: inference latency"]).toBe("now");
    expect(byTitle["Design review — voice pipeline v2"]).toBe("upcoming");
  });

  it("counts down the remaining events as the day goes on", async () => {
    expect((await gatherSnapshot({ now: at(6) })).schedule.remaining).toBe(7);
    clearCache();
    expect((await gatherSnapshot({ now: at(13) })).schedule.remaining).toBe(4);
    clearCache();
    expect((await gatherSnapshot({ now: at(23) })).schedule.remaining).toBe(0);
  });

  /** Gaps are only interesting if you could actually put something in them. */
  it("finds the gaps in what's left of the day", async () => {
    const { freeWindows } = (await gatherSnapshot({ now: at(6) })).schedule;

    // The 15-minute hole between standup and deep work is the walk between
    // two meetings, not a window — it must not be offered as one.
    expect(freeWindows).not.toContainEqual({ from: "9:15 a.m.", to: "9:30 a.m.", minutes: 15 });
    expect(freeWindows.every((window) => window.minutes >= 30)).toBe(true);
    expect(freeWindows).toContainEqual({ from: "1:30 p.m.", to: "2 p.m.", minutes: 30 });
  });

  it("splits tasks into open and done", async () => {
    const { tasks } = await gatherSnapshot({ now: at(7) });
    expect(tasks.open + tasks.done).toBe(7);
    expect(tasks.items.every((task) => task.priority)).toBe(true);
    expect(tasks.items.some((task) => task.overdue)).toBe(false);
  });
});
