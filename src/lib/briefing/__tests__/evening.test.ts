import { describe, expect, it } from "vitest";
import { composeEvening } from "@/lib/briefing/evening";
import type { BriefingSnapshot } from "@/lib/briefing/snapshot";

function snapshot(overrides: Partial<BriefingSnapshot> = {}): BriefingSnapshot {
  return {
    userName: "Zach",
    now: { weekday: "Friday", date: "August 21", time: "8:15 PM", hour: 20, minutes: 1215 },
    weather: null,
    schedule: { remaining: 0, total: 0, events: [], freeWindows: [], conflicts: [] },
    inbox: { unread: 0, messages: [] },
    tasks: { open: 0, done: 0, items: [] },
    portfolio: null,
    news: { local: [], global: [], curatedLocal: false },
    commute: null,
    packages: [],
    tomorrow: null,
    ...overrides,
  };
}

describe("composeEvening", () => {
  it("opens with a plain goodnight", () => {
    expect(composeEvening(snapshot())).toMatch(/^Good evening, Zach\./);
  });

  it("reports how many tasks got done today", () => {
    const text = composeEvening(snapshot({ tasks: { open: 2, done: 3, items: [] } }));
    expect(text).toContain("You wrapped up 3 of 5 tasks today.");
  });

  it("says nothing got done without scolding, when the count is zero", () => {
    const text = composeEvening(snapshot({ tasks: { open: 4, done: 0, items: [] } }));
    expect(text).toContain("Nothing got checked off today — tomorrow's a fresh start.");
  });

  it("stays quiet about tasks entirely when there were none to begin with", () => {
    const text = composeEvening(snapshot({ tasks: { open: 0, done: 0, items: [] } }));
    expect(text).not.toContain("task");
  });

  it("mentions where the portfolio closed, reusing the same line the morning uses", () => {
    const text = composeEvening(
      snapshot({
        portfolio: { connected: true, mode: "live", totalValue: 128_400, dayChangePct: -1.24, movers: [] },
      }),
    );
    expect(text).toContain("down 1.2 percent today, at 128,400 dollars.");
  });

  it("says what tomorrow opens with", () => {
    const text = composeEvening(
      snapshot({
        tomorrow: { firstEvent: { title: "Standup", start: "9 a.m.", location: "Zoom" } },
      }),
    );
    expect(text).toContain("Tomorrow starts with Standup at 9 a.m., Zoom.");
  });

  it("says tomorrow is clear when the fetch succeeded and found nothing", () => {
    const text = composeEvening(snapshot({ tomorrow: { firstEvent: null } }));
    expect(text).toContain("Nothing on the calendar first thing tomorrow.");
  });

  /** null means the fetch wasn't asked for or failed — silence, not a guess. */
  it("says nothing about tomorrow when that data wasn't gathered", () => {
    const text = composeEvening(snapshot({ tomorrow: null }));
    expect(text).not.toContain("Tomorrow");
    expect(text).not.toContain("tomorrow");
  });

  it("produces a valid wind-down when nothing else is present", () => {
    const text = composeEvening(snapshot());
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("NaN");
  });
});
