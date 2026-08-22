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
    tomorrow: null,
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
    expect(composeNow(snapshot()).text).toMatch(/^It's 1:15 PM\./);
  });

  /**
   * The whole point of this mode: the morning briefing already covered the
   * day, so none of it should come back.
   */
  it("repeats none of the morning briefing", () => {
    const { text } = composeNow(
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
    const { text } = composeNow(
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
    const { text } = composeNow(
      snapshot({
        schedule: { ...snapshot().schedule, events: [event("Roadmap", "3:30 p.m.", "4:15 p.m.", "upcoming")] },
      }),
    );
    expect(text).toContain("in 2h 15m");
  });

  /** Past the horizon it isn't "next", it's "later" — and worth less urgency. */
  it("stops counting down for something hours away", () => {
    const { text } = composeNow(
      snapshot({
        schedule: { ...snapshot().schedule, events: [event("Roadmap", "4:30 p.m.", "5:15 p.m.", "upcoming")] },
      }),
    );
    expect(text).toContain("Nothing until Roadmap at 4:30 p.m.");
  });

  /** A spoken time already ends in a period; two reads as a stumble. */
  it("never doubles the period after a spoken time", () => {
    const { text } = composeNow(
      snapshot({
        schedule: { ...snapshot().schedule, events: [event("Roadmap", "4:30 p.m.", "5:15 p.m.", "upcoming")] },
      }),
    );
    expect(text).not.toContain("..");
  });

  it("says plainly when there is nothing left", () => {
    expect(composeNow(snapshot()).text).toContain("Nothing else on the calendar today.");
  });

  it("puts a leave-by time ahead of what's next", () => {
    const { text } = composeNow(
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
    const { text } = composeNow(
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

    const { text } = composeNow(
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

    expect(composeNow(snapshot({ weather: { ...base, condition: "Partly cloudy", precipChance: 20 } })).text)
      .not.toContain("rain");
    expect(composeNow(snapshot({ weather: { ...base, condition: "Rain", precipChance: 80 } })).text)
      .toContain("80 percent chance of rain");
    expect(composeNow(snapshot({ weather: { ...base, condition: "Thunderstorms", code: 95, precipChance: 40 } })).text)
      .toContain("Thunderstorms outside");
  });
});

/**
 * The reason this composer is built out of keyed facts: an update twenty
 * minutes after the last one should say what changed, not say it all again.
 */
describe("composeNow, on a second look", () => {
  const withNext = snapshot({
    schedule: {
      ...snapshot().schedule,
      events: [event("Interview", "2 p.m.", "3 p.m.", "upcoming")],
    },
    tasks: {
      open: 1,
      done: 0,
      items: [
        { title: "Interview feedback", due: "Today, EOD", priority: "medium", project: "Hiring", overdue: false },
      ],
    },
  });

  it("hands back keys for everything it said", () => {
    const first = composeNow(withNext);
    expect(first.keys).toContain("next:Interview@soon");
    expect(first.keys.some((key) => key.startsWith("tasks:"))).toBe(true);
  });

  it("says nothing new when nothing has changed", () => {
    const first = composeNow(withNext);
    const second = composeNow(withNext, { said: first.keys });

    expect(second.text).toContain("Nothing new since you last looked.");
    expect(second.text).not.toContain("Interview feedback");
    // The time is not a fact and is always worth saying.
    expect(second.text).toMatch(/^It's 1:15 PM\./);
  });

  it("still says the parts that did change", () => {
    const first = composeNow(withNext);

    const moved = snapshot({
      ...withNext,
      schedule: {
        ...withNext.schedule,
        events: [event("Design review", "1:30 p.m.", "2:30 p.m.", "upcoming")],
      },
    });

    const second = composeNow(moved, { said: first.keys });
    expect(second.text).toContain("Design review");
    expect(second.text).not.toContain("Interview feedback");
  });

  /** A countdown that has become urgent is new information, not a repeat. */
  it("re-raises a fact whose urgency changed", () => {
    const commute = {
      destination: "Interview",
      address: "500 S Australian Ave",
      startsAt: "14:00",
      driveMinutes: 29,
      distanceMiles: 12,
      leaveInMinutes: 40,
      leaveAtLabel: "1:31 PM",
      freeFlow: true,
    };

    const first = composeNow(snapshot({ commute }));
    expect(first.text).toContain("Leave in 40 minutes");

    const sameStage = composeNow(snapshot({ commute: { ...commute, leaveInMinutes: 35 } }), {
      said: first.keys,
    });
    expect(sameStage.text).not.toContain("Leave in");

    const urgent = composeNow(snapshot({ commute: { ...commute, leaveInMinutes: 8 } }), {
      said: first.keys,
    });
    expect(urgent.text).toContain("Leave in 8 minutes");

    const late = composeNow(snapshot({ commute: { ...commute, leaveInMinutes: -5 } }), {
      said: [...first.keys, ...urgent.keys],
    });
    expect(late.text).toContain("5 minutes past when you should have left");
  });

  it("mentions a task again once it crosses into overdue", () => {
    const due = snapshot({
      tasks: {
        open: 1,
        done: 0,
        items: [{ title: "Merge the PR", due: "Today, 2pm", priority: "high", project: "p", overdue: false }],
      },
    });
    const first = composeNow(due);

    const late = composeNow(
      snapshot({
        tasks: {
          open: 1,
          done: 0,
          items: [{ title: "Merge the PR", due: "Today, 2pm", priority: "high", project: "p", overdue: true }],
        },
      }),
      { said: first.keys },
    );

    expect(late.text).toContain("Merge the PR, overdue");
  });

  /** `since` is what makes mail a delta rather than a three-hour window. */
  it("only counts mail that arrived since the last update", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-21T17:15:00Z"));
    const lastLook = Date.now() - 20 * 60_000;

    const mail = (sender: string, minutesAgo: number) => ({
      sender,
      subject: "something",
      preview: "",
      important: true,
      label: "Work",
      receivedAt: Date.now() - minutesAgo * 60_000,
    });

    const { text } = composeNow(
      snapshot({ inbox: { unread: 2, messages: [mail("Priya", 5), mail("Marcus", 90)] } }),
      { since: lastLook },
    );

    expect(text).toContain("Priya needs you");
    expect(text).not.toContain("Marcus");
  });
});
