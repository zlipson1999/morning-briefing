import { describe, expect, it } from "vitest";
import { automaticSpeakMode } from "@/lib/briefedToday";

describe("automaticSpeakMode", () => {
  it("plays the morning briefing on the first daytime open", () => {
    expect(automaticSpeakMode({ hour: 7, morningPlayed: false, eveningPlayed: false }))
      .toBe("morning");
  });

  it("plays what-now after the morning briefing", () => {
    expect(automaticSpeakMode({ hour: 14, morningPlayed: true, eveningPlayed: false }))
      .toBe("now");
  });

  it("plays the wind-down once after 8pm, even if morning was missed", () => {
    expect(automaticSpeakMode({ hour: 20, morningPlayed: true, eveningPlayed: false }))
      .toBe("evening");
    expect(automaticSpeakMode({ hour: 23, morningPlayed: false, eveningPlayed: false }))
      .toBe("evening");
  });

  it("returns to what-now after the evening wind-down has played", () => {
    expect(automaticSpeakMode({ hour: 21, morningPlayed: true, eveningPlayed: true }))
      .toBe("now");
    expect(automaticSpeakMode({ hour: 21, morningPlayed: false, eveningPlayed: true }))
      .toBe("now");
  });
});
