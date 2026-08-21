import { afterEach, describe, expect, it, vi } from "vitest";
import { composeNow } from "@/lib/briefing/now";
import type { BriefingSnapshot } from "@/lib/briefing/snapshot";

function snapshot(overrides: Partial<BriefingSnapshot> = {}): BriefingSnapshot {
  return {
    userName: "Zach",
    // 1:15pm.
    now: { weekday: "Friday", date: "August 21", time: "1:15 PM", hour: 13, minutes: 795 },
    weather: null,
    schedule: { remaining: 0, total: 0, events: [], freeWindows: [], conflicts: [] },
    inbox: { unread: 0, messages: [] },
    tasks: { open: 0, done: 0, items: [] },
    portfolio: null,
    news: { local: [], global: [], curatedLocal: false },
    commute: null,
    ...overrides,
  };
}

const event = (
  title: string,
  start: string,
  end: string,
  status: "past" | "now" | "upcoming",
) => ({ title, start, end, location: "Zoom", kind: "meeting", attendees: [], status });

afterEach(() => vi.useRealTimers());

describe("composeNow", () => {
  it("leads with the time", () => {
    expect(composeNow(snapshot())).toMatch(/^It's 1:15 PM\./);
  });

  /**
   * The whole point of this mode: the morning briefing already covered the
   * day, so none of it should come back.
   */
  it("repeats none of the morning briefing", () => {
    const text = composeNow(
      snapshot({
        news: {
          local: [{ title: "Lantana bridge closes", source: "Palm Beach Post" }],
          global: [{ title: "Somewhere far away", source: "BBC" }],
          curatedLocal: true,
        },
        weather: {
          place: "Lantana, Florida", tempF: 84, feelsLikeF: 94, highF: 91, lowF: 78,
          condition: "Partly cloudy", code: 2, isDay: true, humidity: 71,
          precipChance: 10, precipTotalIn: 0, windMph: 11, gustMph: 14, windFrom: "ESE",
          uvIndexMax: 9.4, sunrise: "6:57 AM", sunset: "7:52 PM", daylightMinutes: 775, hourly: [],
        },
        portfolio: { connected: true, mode: "live", totalValue: 128_400, dayChangePct: 1.2, movers: [] },
      }),
    );

    expect(text).not.toContain("bridge");
    expect(text).not.toContain("Somewhere far away");
    expect(text).not.toContain("degrees");
    expect(text).not.toContain("Sunrise");
    expect(text).not.toContain("percent today");
  });

  it("says what you're in the middle of, and what's next", () => {
    const text = composeNow(
      snapshot({
        schedule: {
          remaining: 2,
          total: 3,
          events: [
            event("Standup", "9 a.m.", "9:15 a.m.", "past"),
            event("Lunch", "12:30 p.m.", "1:30 p.m.", "now"),
            event("Interview", "2 p.m.", "3 p.m.", "upcoming"),
          ],
          freeWindows: [],
          conflicts: [],
        },
      }),
    );

    expect(text).toContain("You're in Lunch until 1:30 p.m.");
    expect(text).toContain("Next is Interview at 2 p.m., in 45 minutes");
    expect(text).not.toContain("Standup");
  });

  it("counts a gap of hours in hours", () => {
    const text = composeNow(
      snapshot({
        schedule: { ...snapshot().schedule, events: [event("Roadmap", "3:30 p.m.", "4:15 p.m.", "upcoming")] },
      }),
    );
    expect(text).toContain("in 2h 15m");
  });

  /** Past the horizon it isn't "next", it's "later" — and worth less urgency. */
  it("stops counting down for something hours away", () => {
    const text = composeNow(
      snapshot({
        schedule: { ...snapshot().schedule, events: [event("Roadmap", "4:30 p.m.", "5:15 p.m.", "upcoming")] },
      }),
    );
    expect(text).toContain("Nothing until Roadmap at 4:30 p.m.");
  });

  /** A spoken time already ends in a period; two reads as a stumble. */
  it("never doubles the period after a spoken time", () => {
    const text = composeNow(
      snapshot({
        schedule: { ...snapshot().schedule, events: [event("Roadmap", "4:30 p.m.", "5:15 p.m.", "upcoming")] },
      }),
    );
    expect(text).not.toContain("..");
  });

  it("says plainly when there is nothing left", () => {
    expect(composeNow(snapshot())).toContain("Nothing else on the calendar today.");
  });

  it("puts a leave-by time ahead of what's next", () => {
    const text = composeNow(
      snapshot({
        commute: {
          destination: "Interview",
          address: "500 S Australian Ave",
          startsAt: "14:00",
          driveMinutes: 29,
          distanceMiles: 12,
          leaveInMinutes: 16,
          leaveAtLabel: "1:31 PM",
          freeFlow: true,
        },
        schedule: { ...snapshot().schedule, events: [event("Interview", "2 p.m.", "3 p.m.", "upcoming")] },
      }),
    );
    expect(text.indexOf("Leave in 16 minutes")).toBeLessThan(text.indexOf("Next is Interview"));
  });

  it("only mentions work that's due about now", () => {
    const text = composeNow(
      snapshot({
        tasks: {
          open: 3,
          done: 0,
          items: [
            { title: "Interview feedback", due: "Today, EOD", priority: "medium", project: "Hiring", overdue: false },
            { title: "Renew the domain", due: "Fri", priority: "low", project: "Personal", overdue: false },
            { title: "Merge the PR", due: "Yesterday", priority: "medium", project: "p", overdue: true },
          ],
        },
      }),
    );

    expect(text).toContain("Still open: Interview feedback");
    expect(text).toContain("1 other thing due about now");
    expect(text).not.toContain("Renew the domain");
  });

  it("names only mail that arrived recently and was flagged", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-21T17:15:00Z"));

    const text = composeNow(
      snapshot({
        inbox: {
          unread: 3,
          messages: [
            { sender: "Priya Raghavan", subject: "p99 again", preview: "", important: true, label: "Work", receivedAt: Date.now() - 20 * 60_000 },
            { sender: "Old News", subject: "this morning", preview: "", important: true, label: "Work", receivedAt: Date.now() - 8 * 60 * 60_000 },
            { sender: "GitHub", subject: "checks failed", preview: "", important: false, label: "Updates", receivedAt: Date.now() },
          ],
        },
      }),
    );

    expect(text).toContain("Priya Raghavan needs you: p99 again.");
    expect(text).not.toContain("Old News");
    expect(text).not.toContain("GitHub");
  });

  it("mentions weather only when it would change what you do", () => {
    const base = {
      place: "Lantana, Florida", tempF: 84, feelsLikeF: 94, highF: 91, lowF: 78,
      code: 2, isDay: true, humidity: 71, precipTotalIn: 0, windMph: 11, gustMph: 14,
      windFrom: "ESE", uvIndexMax: 9.4, sunrise: "6:57 AM", sunset: "7:52 PM",
      daylightMinutes: 775, hourly: [],
    };

    expect(composeNow(snapshot({ weather: { ...base, condition: "Partly cloudy", precipChance: 20 } })))
      .not.toContain("rain");
    expect(composeNow(snapshot({ weather: { ...base, condition: "Rain", precipChance: 80 } })))
      .toContain("80 percent chance of rain");
    expect(composeNow(snapshot({ weather: { ...base, condition: "Thunderstorms", code: 95, precipChance: 40 } })))
      .toContain("Thunderstorms outside");
  });
});
