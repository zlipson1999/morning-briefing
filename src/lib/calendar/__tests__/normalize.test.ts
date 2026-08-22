import { describe, expect, it } from "vitest";
import { addressFrom, kindFrom, normalizeEvent, normalizePayload } from "@/lib/calendar/normalize";

describe("normalizeEvent", () => {
  /** Zapier's Google Calendar trigger sends all three of these shapes. */
  it("reads nested, flattened and renamed field shapes alike", () => {
    const nested = normalizeEvent({
      id: "a",
      summary: "Design review",
      start: { dateTime: "2026-08-21T11:00:00-04:00" },
      end: { dateTime: "2026-08-21T12:00:00-04:00" },
    });
    const flattened = normalizeEvent({
      id: "a",
      summary: "Design review",
      start__dateTime: "2026-08-21T11:00:00-04:00",
      end__dateTime: "2026-08-21T12:00:00-04:00",
    });
    const renamed = normalizeEvent({
      event_id: "a",
      event_title: "Design review",
      start_time: "2026-08-21T11:00:00-04:00",
      end_time: "2026-08-21T12:00:00-04:00",
    });

    expect(nested?.title).toBe("Design review");
    expect(flattened?.startIso).toBe(nested?.startIso);
    expect(renamed?.startIso).toBe(nested?.startIso);
    expect(renamed?.id).toBe("a");
  });

  it("treats a bare date as an all-day event at local midnight", () => {
    const event = normalizeEvent({ summary: "Birthday", start: { date: "2026-08-21" } });
    expect(event?.allDay).toBe(true);
    expect(new Date(event!.startIso).getHours()).toBe(0);
  });

  it("defaults a missing end time to an hour later", () => {
    const event = normalizeEvent({ summary: "Quick sync", start: "2026-08-21T09:00:00Z" });
    expect(Date.parse(event!.endIso) - Date.parse(event!.startIso)).toBe(60 * 60_000);
  });

  it("rejects anything without a title or a start", () => {
    expect(normalizeEvent({ summary: "No time" })).toBeNull();
    expect(normalizeEvent({ start: "2026-08-21T09:00:00Z" })).toBeNull();
    expect(normalizeEvent({ summary: "Bad time", start: "not a date" })).toBeNull();
  });

  it("falls back to title-plus-start as an id, so a resend overwrites itself", () => {
    const once = normalizeEvent({ summary: "Standup", start: "2026-08-21T09:00:00Z" });
    const again = normalizeEvent({ summary: "Standup", start: "2026-08-21T09:00:00Z" });
    expect(once?.id).toBe(again?.id);
  });

  it("reads attendees as strings or as Google's objects", () => {
    expect(
      normalizeEvent({
        summary: "Sync",
        start: "2026-08-21T09:00:00Z",
        attendees: [{ displayName: "Priya R." }, { email: "marcus@nimbus.dev" }],
      })?.attendees,
    ).toEqual(["Priya R.", "marcus@nimbus.dev"]);

    expect(
      normalizeEvent({ summary: "Sync", start: "2026-08-21T09:00:00Z", guests: "Ann, Bob" })?.attendees,
    ).toEqual(["Ann", "Bob"]);
  });

  it("marks a cancelled event so the store can drop it", () => {
    expect(normalizeEvent({ summary: "Gone", start: "2026-08-21T09:00:00Z", status: "cancelled" })?.cancelled).toBe(true);
  });
});

/**
 * This is what decides whether a leave-by time is even possible, so it errs
 * toward silence: a wrong address routes you somewhere you aren't going.
 */
describe("addressFrom", () => {
  it("accepts a real street address", () => {
    expect(addressFrom("500 S Australian Ave, West Palm Beach, FL 33401")).toBeTruthy();
    expect(addressFrom("319 Belvedere Rd, West Palm Beach FL")).toBeTruthy();
  });

  it("refuses rooms, links and placeholders", () => {
    for (const location of [
      "Conf Rm 4B",
      "Zoom",
      "https://us02web.zoom.us/j/8412",
      "Google Meet",
      "Microsoft Teams",
      "TBD",
      "Remote",
      "",
      "Blocked",
    ]) {
      expect(addressFrom(location)).toBeUndefined();
    }
  });

  it("refuses a name with no street number", () => {
    expect(addressFrom("Cafe Lento")).toBeUndefined();
  });
});

describe("kindFrom", () => {
  it("reads the kind off the title and the guest list", () => {
    expect(kindFrom("Interview — ML Infra", "Zoom", ["Amara"])).toBe("interview");
    expect(kindFrom("Lunch w/ Marcus", "Cafe", ["Marcus"])).toBe("personal");
    expect(kindFrom("Deep work: latency", "Blocked", [])).toBe("focus");
    expect(kindFrom("Standup", "Zoom", ["Priya"])).toBe("meeting");
  });
});

describe("normalizePayload", () => {
  const one = { summary: "A", start: "2026-08-21T09:00:00Z" };

  it("accepts a single event, a wrapped list, and a bare array", () => {
    expect(normalizePayload(one)).toHaveLength(1);
    expect(normalizePayload({ events: [one, { ...one, summary: "B" }] })).toHaveLength(2);
    expect(normalizePayload([one, { ...one, summary: "B" }])).toHaveLength(2);
  });

  it("drops the unusable entries and keeps the rest", () => {
    expect(normalizePayload([one, { nonsense: true }, null, "string"])).toHaveLength(1);
  });

  it("returns nothing for a payload that isn't events at all", () => {
    expect(normalizePayload(null)).toEqual([]);
    expect(normalizePayload("hello")).toEqual([]);
  });
});
