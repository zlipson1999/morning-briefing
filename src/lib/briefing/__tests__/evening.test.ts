import { describe, expect, it } from "vitest";
import { composeEvening } from "@/lib/briefing/evening";
import type { BriefingSnapshot } from "@/lib/briefing/snapshot";

function snapshot(overrides: Partial<BriefingSnapshot> = {}): BriefingSnapshot {
  return {
    userName: "Zach",
    now: { weekday: "Friday", date: "August 21", time: "9:15 PM", hour: 21, minutes: 1275 },
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

describe("composeEvening", () => {
  it("summarizes completed work and tomorrow's first event", () => {
    const text = composeEvening(snapshot({
      tasks: { open: 2, done: 3, items: [] },
      tomorrow: { firstEvent: { title: "Standup", start: "9 a.m.", location: "Zoom" } },
    }));

    expect(text).toContain("wrapped up 3 of 5 tasks today");
    expect(text).toContain("Tomorrow starts with Standup at 9 a.m., Zoom.");
  });

  it("is encouraging when nothing was completed", () => {
    expect(composeEvening(snapshot({ tasks: { open: 2, done: 0, items: [] } })))
      .toContain("tomorrow's a fresh start");
  });

  it("omits unavailable sections without inventing facts", () => {
    const text = composeEvening(snapshot());
    expect(text).toBe("Good evening, Zach.");
    expect(text).not.toContain("tomorrow");
    expect(text).not.toContain("portfolio");
  });

  it("states when a real tomorrow calendar is empty", () => {
    expect(composeEvening(snapshot({ tomorrow: { firstEvent: null } })))
      .toContain("Nothing on the calendar first thing tomorrow.");
  });
});
