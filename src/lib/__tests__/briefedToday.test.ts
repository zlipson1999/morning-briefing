import { describe, expect, it } from "vitest";
import { automaticBriefingMode } from "@/lib/briefedToday";

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
