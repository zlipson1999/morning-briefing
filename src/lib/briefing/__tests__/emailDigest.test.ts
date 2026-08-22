import { describe, expect, it } from "vitest";
import { inboxDigest, spokenEmailTopic } from "../emailDigest";

function message(overrides: Partial<Parameters<typeof spokenEmailTopic>[0]> = {}) {
  return {
    sender: "Support Team <support@example.com>",
    subject: "Status update",
    preview: "The work is ready for your review.",
    important: true,
    label: "Work",
    receivedAt: null,
    ...overrides,
  };
}

describe("spoken email digests", () => {
  it("uses the useful email content instead of a noisy ticket subject", () => {
    const topic = spokenEmailTopic(
      message({
        subject: "Re: [Support] Ticket #48211 — HailoRT_driver_timeout",
        preview:
          "Thanks for the logs. Our team reproduced the timeout on kernel 6.18. A patched runtime is available.",
      }),
    );

    expect(topic).toBe("our team reproduced the timeout on kernel 6.18");
    expect(topic).not.toMatch(/re:|ticket|48211|support/i);
  });

  it("gives the overall count but reads no more than three useful emails", () => {
    const digest = inboxDigest({
      unread: 12,
      messages: [
        message({ sender: "Priya Raghavan", subject: "Budget approval" }),
        message({ sender: "Marcus Lee", subject: "Tomorrow's client meeting" }),
        message({ sender: "Sofia Chen", subject: "Contract ready for signature" }),
        message({ sender: "Fourth Person", subject: "Should not be spoken" }),
      ],
    });

    expect(digest).toContain("You have 12 unread emails.");
    expect(digest).toContain("Priya about budget approval");
    expect(digest).toContain("Marcus about tomorrow's client meeting");
    expect(digest).toContain("Sofia about contract ready for signature");
    expect(digest).not.toContain("Fourth");
  });

  it("keeps an empty inbox brief", () => {
    expect(inboxDigest({ unread: 0, messages: [] })).toBe("Your inbox is clear.");
  });
});

