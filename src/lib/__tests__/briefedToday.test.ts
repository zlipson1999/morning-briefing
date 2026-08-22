import { afterEach, describe, expect, it, vi } from "vitest";
import {
  automaticBriefingMode,
  hasBriefedToday,
  markBriefedToday,
  markEveningBriefedToday,
  subscribeBriefingHistory,
} from "@/lib/briefedToday";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("automaticBriefingMode", () => {
  it("plays the morning briefing on the first daytime open", () => {
    expect(automaticBriefingMode({ hour: 7, morningPlayed: false, eveningPlayed: false }))
      .toBe("morning");
  });

  it("plays what-now after the morning briefing", () => {
    expect(automaticBriefingMode({ hour: 14, morningPlayed: true, eveningPlayed: false }))
      .toBe("now");
  });

  it("plays the wind-down once after 8pm, even if morning was missed", () => {
    expect(automaticBriefingMode({ hour: 20, morningPlayed: true, eveningPlayed: false }))
      .toBe("evening");
    expect(automaticBriefingMode({ hour: 23, morningPlayed: false, eveningPlayed: false }))
      .toBe("evening");
  });

  it("returns to what-now after the evening wind-down has played", () => {
    expect(automaticBriefingMode({ hour: 21, morningPlayed: true, eveningPlayed: true }))
      .toBe("now");
    expect(automaticBriefingMode({ hour: 21, morningPlayed: false, eveningPlayed: true }))
      .toBe("now");
  });
});

describe("briefing history subscriptions", () => {
  it("notifies the current tab when the morning briefing starts", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    const listener = vi.fn();
    const unsubscribe = subscribeBriefingHistory(listener);

    expect(hasBriefedToday()).toBe(false);
    markBriefedToday();

    expect(hasBriefedToday()).toBe(true);
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it("notifies once when the evening wind-down starts", () => {
    vi.stubGlobal("localStorage", { getItem: vi.fn(), setItem: vi.fn() });
    const listener = vi.fn();
    const unsubscribe = subscribeBriefingHistory(listener);

    markEveningBriefedToday();

    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });
});

