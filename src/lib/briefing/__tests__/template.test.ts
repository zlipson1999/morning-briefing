import { describe, expect, it } from "vitest";
import { composeTemplate } from "@/lib/briefing/template";
import type { BriefingSnapshot } from "@/lib/briefing/snapshot";

function snapshot(overrides: Partial<BriefingSnapshot> = {}): BriefingSnapshot {
  return {
    userName: "Zach",
    now: { weekday: "Friday", date: "August 21", time: "7:15 AM", hour: 7, minutes: 435 },
    weather: null,
    schedule: { remaining: 0, total: 0, events: [], freeWindows: [], conflicts: [] },
    inbox: { unread: 0, messages: [] },
    tasks: { open: 0, done: 0, items: [] },
    portfolio: null,
    news: { local: [], florida: [], us: [], world: [], curatedLocal: false },
    commute: null,
    tomorrow: null,
    ...overrides,
  };
}

describe("composeTemplate", () => {
  it("greets by the hour", () => {
    expect(composeTemplate(snapshot({ now: { ...snapshot().now, hour: 1 } }))).toMatch(/^Good evening/);
    expect(composeTemplate(snapshot())).toMatch(/^Good morning, Zach\./);
    expect(composeTemplate(snapshot({ now: { ...snapshot().now, hour: 14 } }))).toMatch(/^Good afternoon/);
    expect(composeTemplate(snapshot({ now: { ...snapshot().now, hour: 21 } }))).toMatch(/^Good evening/);
  });

  /**
   * Every section is optional by construction — a dead upstream costs you a
   * sentence, never the briefing.
   */
  it("produces a valid briefing when every upstream is missing", () => {
    const text = composeTemplate(snapshot());
    expect(text).toContain("Good morning, Zach.");
    expect(text).toContain("Your calendar is clear");
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("NaN");
  });

  it("says symbols as words, since it's read aloud", () => {
    const text = composeTemplate(
      snapshot({
        portfolio: { connected: true, mode: "live", totalValue: 128_400, dayChangePct: -1.24, movers: [] },
      }),
    );
    expect(text).toContain("down 1.2 percent");
    expect(text).toContain("128,400 dollars");
    expect(text).not.toContain("%");
    expect(text).not.toContain("$");
  });

  it("stays quiet when there is no real money data at all", () => {
    const text = composeTemplate(
      snapshot({ portfolio: { connected: false, mode: "mock", totalValue: 1, dayChangePct: 9, movers: [] } }),
    );
    expect(text).not.toContain("portfolio");
    expect(text).not.toContain("watchlist");
  });

  /**
   * A watchlist with no shares in it has no total worth saying — but a
   * symbol that actually moved does.
   */
  it("reads watchlist movers rather than a total you don't have", () => {
    const text = composeTemplate(
      snapshot({
        portfolio: {
          connected: false,
          mode: "watchlist",
          totalValue: 0,
          dayChangePct: 0,
          movers: [
            { symbol: "NVDA", dayChangePct: -3.4 },
            { symbol: "SPY", dayChangePct: 0.2 },
          ],
        },
      }),
    );

    expect(text).toContain("On your watchlist: NVDA down 3.4 percent.");
    // 0.2% is noise, not news.
    expect(text).not.toContain("SPY");
  });

  it("says nothing when the whole watchlist is flat", () => {
    const text = composeTemplate(
      snapshot({
        portfolio: {
          connected: false,
          mode: "watchlist",
          totalValue: 0,
          dayChangePct: 0,
          movers: [{ symbol: "SPY", dayChangePct: 0.1 }],
        },
      }),
    );
    expect(text).not.toContain("watchlist");
  });

  it("calls it holdings rather than a portfolio when it isn't your account", () => {
    const text = composeTemplate(
      snapshot({
        portfolio: { connected: false, mode: "watchlist", totalValue: 42_000, dayChangePct: 1.1, movers: [] },
      }),
    );
    expect(text).toContain("Your holdings up 1.1 percent today, at 42,000 dollars.");
  });

  it("counts the day's remaining events and names the next one", () => {
    const text = composeTemplate(
      snapshot({
        schedule: {
          remaining: 2,
          total: 3,
          events: [
            { title: "Standup", start: "9 a.m.", end: "9:15 a.m.", location: "Zoom", kind: "meeting", attendees: [], status: "past" },
            { title: "Design review", start: "11 a.m.", end: "12 p.m.", location: "4B", kind: "meeting", attendees: [], status: "upcoming" },
            { title: "1:1", start: "3:30 p.m.", end: "4 p.m.", location: "2A", kind: "meeting", attendees: [], status: "upcoming" },
          ],
          freeWindows: [],
          conflicts: [],
        },
      }),
    );
    expect(text).toContain("2 events left today");
    expect(text).toContain("Next up is Design review at 11 a.m.");
    // A spoken time already ends in a period; two reads as a stumble.
    expect(text).not.toContain("..");
  });

  it("calls out a calendar conflict", () => {
    const text = composeTemplate(
      snapshot({
        schedule: { ...snapshot().schedule, conflicts: [{ a: "Design review", b: "Interview" }] },
      }),
    );
    expect(text).toContain("Design review overlaps Interview");
  });

  it("gives the leave-by time, and switches wording once you're late", () => {
    const commute = {
      destination: "Design review",
      address: "500 S Australian Ave",
      startsAt: "11:00",
      driveMinutes: 29,
      distanceMiles: 12,
      leaveInMinutes: 31,
      leaveAtLabel: "10:31 AM",
      freeFlow: true,
    };

    expect(composeTemplate(snapshot({ commute }))).toContain("Leave in 31 minutes for Design review");
    expect(composeTemplate(snapshot({ commute: { ...commute, leaveInMinutes: -14 } })))
      .toContain("14 minutes past when you should have left");
  });

  it("reads the whole forecast, not just the temperature", () => {
    const text = composeTemplate(
      snapshot({
        weather: {
          place: "Lantana, Florida",
          tempF: 84, feelsLikeF: 94, highF: 91, lowF: 78,
          condition: "Thunderstorms", code: 95, isDay: true,
          humidity: 71, precipChance: 65, precipTotalIn: 0.42,
          windMph: 11, gustMph: 25, windFrom: "ESE",
          uvIndexMax: 9.4, sunrise: "6:57 AM", sunset: "7:52 PM",
          daylightMinutes: 775, hourly: [],
        },
      }),
    );

    expect(text).toContain("84 degrees and thunderstorms");
    expect(text).toContain("feeling like 94");
    expect(text).toContain("Humidity 71 percent");
    expect(text).toContain("out of the ESE");
    expect(text).toContain("gusting to 25");
    expect(text).toContain("65 percent chance of rain");
    expect(text).toContain("UV index peaks at 9 — very high");
    expect(text).toContain("Sunrise 6:57 AM, sunset 7:52 PM");
  });

  /**
   * The requested order: what's happening locally leads, then what you owe,
   * then who's waiting on you. The wider world comes last.
   */
  it("reads local, Florida, U.S. and world news in order", () => {
    const text = composeTemplate(
      snapshot({
        news: {
          local: [{ title: "Lantana bridge closes for repairs", source: "Palm Beach Post" }],
          florida: [{ title: "Florida expands coastal protections", source: "Florida Phoenix" }],
          us: [{ title: "Congress advances infrastructure plan", source: "NPR National" }],
          world: [{ title: "Global summit reaches agreement", source: "BBC World" }],
          curatedLocal: true,
        },
        tasks: {
          open: 1,
          done: 0,
          items: [{ title: "Ship the thing", due: "Today", priority: "high", project: "p", overdue: false }],
        },
      }),
    );

    const local = text.indexOf("Lantana bridge closes");
    const florida = text.indexOf("Florida expands coastal protections");
    const us = text.indexOf("Congress advances infrastructure plan");
    const world = text.indexOf("Global summit reaches agreement");
    const tasks = text.indexOf("1 open task");
    const inbox = text.indexOf("inbox is clear");

    expect(local).toBeGreaterThan(-1);
    expect(local).toBeLessThan(florida);
    expect(florida).toBeLessThan(us);
    expect(us).toBeLessThan(world);
    expect(world).toBeLessThan(tasks);
    expect(tasks).toBeLessThan(inbox);
    expect(text).toContain("from Palm Beach Post");
    expect(text).toContain("Across Florida:");
    expect(text).toContain("Across the U.S.:");
    expect(text).toContain("Around the world:");
  });

  /**
   * The one exception to that order: being late is not a sixth sentence.
   */
  it("hoists an imminent leave-by above everything else", () => {
    const commute = {
      destination: "Design review",
      address: "500 S Australian Ave",
      startsAt: "11:00",
      driveMinutes: 29,
      distanceMiles: 12,
      leaveInMinutes: 12,
      leaveAtLabel: "10:31 AM",
      freeFlow: true,
    };
    const news = {
      local: [{ title: "Lantana bridge closes for repairs", source: "Palm Beach Post" }],
      florida: [],
      us: [],
      world: [],
      curatedLocal: true,
    };

    const urgent = composeTemplate(snapshot({ commute, news }));
    expect(urgent.indexOf("Leave in 12 minutes")).toBeLessThan(urgent.indexOf("Lantana bridge"));

    // A drive three hours out is just part of the day's shape.
    const relaxed = composeTemplate(snapshot({ commute: { ...commute, leaveInMinutes: 180 }, news }));
    expect(relaxed.indexOf("Leave in 180 minutes")).toBeGreaterThan(relaxed.indexOf("Lantana bridge"));
  });

  it("puts overdue work ahead of merely high-priority work", () => {
    const text = composeTemplate(
      snapshot({
        tasks: {
          open: 2,
          done: 0,
          items: [
            { title: "Important thing", due: "Today", priority: "high", project: "p", overdue: false },
            { title: "Merge the scheduler PR", due: "Yesterday", priority: "medium", project: "p", overdue: true },
          ],
        },
      }),
    );
    expect(text).toContain("1 of them is overdue — starting with Merge the scheduler PR");
    expect(text).not.toContain("Important thing");
  });

  it("prioritizes flagged mail and limits the spoken summary", () => {
    const text = composeTemplate(
      snapshot({
        inbox: {
          unread: 3,
          messages: [
            { sender: "Priya Raghavan", subject: "a", preview: "", important: true, label: "Work", receivedAt: null },
            { sender: "Sofia Lindqvist", subject: "b", preview: "", important: true, label: "Work", receivedAt: null },
            { sender: "GitHub", subject: "c", preview: "", important: false, label: "Updates", receivedAt: null },
          ],
        },
      }),
    );
    expect(text).toContain("You have 3 unread emails.");
    expect(text).toContain("The 3 worth a quick look are from Priya");
    expect(text).toContain("Sofia");
    expect(text).toContain("GitHub");
  });
});

