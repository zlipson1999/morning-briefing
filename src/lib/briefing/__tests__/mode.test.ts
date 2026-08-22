import { describe, expect, it } from "vitest";
import { briefingMode } from "@/lib/briefing/mode";

describe("briefingMode", () => {
  it.each(["morning", null, "", "night", "EVENING"])(
    "defaults %s to morning",
    (value) => expect(briefingMode(value)).toBe("morning"),
  );

  it("accepts the two alternate modes", () => {
    expect(briefingMode("now")).toBe("now");
    expect(briefingMode("evening")).toBe("evening");
  });
});
