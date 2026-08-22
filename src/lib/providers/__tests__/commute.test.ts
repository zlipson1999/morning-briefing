import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCache } from "@/lib/cache";
import { nextCommute } from "@/lib/providers/commute";
import type { CalendarEvent } from "@/lib/data";

const HOME = { latitude: 26.5867, longitude: -80.052 };

function event(partial: Partial<CalendarEvent> & { start: string }): CalendarEvent {
  return {
    id: partial.start,
    title: "Somewhere",
    end: "23:59",
    location: "Out",
    attendees: [],
    kind: "meeting",
    ...partial,
  };
}

/** 20 minutes of free-flow driving, 12 miles. */
function stubUpstreams({ seconds = 1200, metres = 19312 } = {}) {
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
    const url = String(input);
    if (url.includes("nominatim")) {
      return new Response(JSON.stringify([{ lat: "26.7153", lon: "-80.0534" }]), { status: 200 });
    }
    if (url.includes("router.project-osrm.org")) {
      return new Response(JSON.stringify({ routes: [{ duration: seconds, distance: metres }] }), { status: 200 });
    }
    return new Response("no", { status: 404 });
  }));
}

beforeEach(() => {
  clearCache();
  stubUpstreams();
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearCache();
});

describe("nextCommute", () => {
  it("picks the next event that has an address", async () => {
    const commute = await nextCommute(
      [
        event({ start: "09:00", title: "Standup" }),
        event({ start: "11:00", title: "Design review", address: "500 S Australian Ave, West Palm Beach, FL" }),
        event({ start: "12:30", title: "Lunch", address: "319 Belvedere Rd, West Palm Beach, FL" }),
      ],
      8 * 60,
      HOME,
    );

    expect(commute?.destination).toBe("Design review");
    expect(commute?.distanceMiles).toBe(12);
  });

  /**
   * A Zoom day is the normal case for this calendar, and it must produce
   * nothing rather than a guess at where "Conf Rm 4B" is.
   */
  it("returns nothing when no upcoming event has an address", async () => {
    const commute = await nextCommute(
      [event({ start: "09:00", location: "Zoom" }), event({ start: "10:00", location: "Blocked" })],
      8 * 60,
      HOME,
    );
    expect(commute).toBeNull();
  });

  it("ignores events that already started", async () => {
    const commute = await nextCommute(
      [event({ start: "07:00", title: "Early", address: "somewhere" })],
      8 * 60,
      HOME,
    );
    expect(commute).toBeNull();
  });

  it("pads a rush-hour arrival more heavily than a midday one", async () => {
    const rush = await nextCommute([event({ start: "08:30", address: "a" })], 6 * 60, HOME);
    clearCache();
    stubUpstreams();
    const midday = await nextCommute([event({ start: "13:00", address: "a" })], 6 * 60, HOME);

    // 20 free-flow minutes: 1.35x + 7 vs 1.1x + 7.
    expect(rush?.driveMinutes).toBe(34);
    expect(midday?.driveMinutes).toBe(29);
  });

  it("counts back from the event to a leave-by time", async () => {
    const commute = await nextCommute([event({ start: "11:00", address: "a" })], 10 * 60, HOME);

    // 11:00 minus 29 minutes of padded midday drive.
    expect(commute?.leaveAtLabel).toBe("10:31 AM");
    expect(commute?.leaveInMinutes).toBe(31);
  });

  it("goes negative once you should already have left", async () => {
    const commute = await nextCommute([event({ start: "11:00", address: "a" })], 10 * 60 + 45, HOME);
    expect(commute?.leaveInMinutes).toBe(-14);
  });

  it("admits the estimate has no live traffic behind it", async () => {
    const commute = await nextCommute([event({ start: "11:00", address: "a" })], 8 * 60, HOME);
    expect(commute?.freeFlow).toBe(true);
  });

  it("returns nothing rather than throwing when the address can't be geocoded", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) =>
      String(input).includes("nominatim")
        ? new Response(JSON.stringify([]), { status: 200 })
        : new Response(JSON.stringify({ routes: [{ duration: 600, distance: 8000 }] }), { status: 200 }),
    ));

    await expect(nextCommute([event({ start: "11:00", address: "nowhere at all" })], 8 * 60, HOME))
      .resolves.toBeNull();
  });

  it("returns nothing rather than throwing when the router is down", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) =>
      String(input).includes("nominatim")
        ? new Response(JSON.stringify([{ lat: "26.7", lon: "-80.0" }]), { status: 200 })
        : new Response("upstream down", { status: 503 }),
    ));

    await expect(nextCommute([event({ start: "11:00", address: "a" })], 8 * 60, HOME))
      .resolves.toBeNull();
  });
});
