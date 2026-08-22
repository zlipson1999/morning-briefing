import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyPackage, classifyPackages, etaFrom, getPackages, type PackageMail } from "@/lib/packages";

const NOW = new Date(2026, 7, 21, 9, 0); // a Friday

function mail(overrides: Partial<PackageMail> = {}): PackageMail {
  return {
    sender: "ship-confirm@amazon.com",
    subject: "Your package has shipped",
    snippet: "Arriving today by 8pm.",
    receivedAt: NOW.getTime(),
    ...overrides,
  };
}

describe("etaFrom", () => {
  it("reads today and tomorrow literally", () => {
    expect(etaFrom("arriving today", NOW).label).toBe("Today");
    expect(etaFrom("arriving tomorrow", NOW).label).toBe("Tomorrow");
  });

  it("reads a weekday name as the next occurrence of that day", () => {
    // NOW is a Friday; "Monday" should land three days out.
    const { label, at } = etaFrom("arriving Monday", NOW);
    expect(label).toContain("Mon");
    expect(new Date(at!).getDay()).toBe(1);
  });

  it("reads a month-and-day date", () => {
    const { label } = etaFrom("Estimated delivery: Aug 25", NOW);
    expect(label).toContain("Aug 25");
  });

  it("finds nothing in text with no date at all", () => {
    expect(etaFrom("Thanks for your order", NOW)).toEqual({ label: "", at: null });
  });
});

describe("classifyPackage", () => {
  it("reads carrier, status and ETA from a shipping email", () => {
    const pkg = classifyPackage(mail(), NOW);
    expect(pkg).toMatchObject({ carrier: "Amazon", status: "shipped", etaLabel: "Today", arrivingToday: true });
  });

  it("recognises every carrier this app looks for", () => {
    for (const [sender, name] of [
      ["track@ups.com", "UPS"],
      ["auto@fedex.com", "FedEx"],
      ["informeddelivery@usps.com", "USPS"],
      ["noreply@dhl.com", "DHL"],
    ] as const) {
      expect(classifyPackage(mail({ sender, subject: "Your package has shipped" }), NOW)?.carrier).toBe(name);
    }
  });

  /** "Out for delivery" means today, even when the email doesn't say a date. */
  it("treats out-for-delivery with no explicit date as arriving today", () => {
    const pkg = classifyPackage(mail({ subject: "Out for delivery", snippet: "" }), NOW);
    expect(pkg).toMatchObject({ status: "out_for_delivery", etaLabel: "Today", arrivingToday: true });
  });

  it("is not fooled into arriving-today by a delivered package", () => {
    const pkg = classifyPackage(mail({ subject: "Your package was delivered today" }), NOW);
    expect(pkg?.status).toBe("delivered");
    expect(pkg?.arrivingToday).toBe(false);
  });

  it("leaves mail alone that isn't recognisably about a shipment", () => {
    expect(classifyPackage(mail({ sender: "newsletter@example.com", subject: "Weekly roundup", snippet: "" }), NOW))
      .toBeNull();
  });

  it("doesn't call something arriving today just because it mentions a future date", () => {
    const pkg = classifyPackage(mail({ subject: "Your package has shipped", snippet: "Arriving Monday" }), NOW);
    expect(pkg?.arrivingToday).toBe(false);
  });
});

describe("classifyPackages", () => {
  it("drops delivered packages — nothing left to radar", () => {
    const list = classifyPackages(
      [mail({ subject: "Delivered" }), mail({ subject: "Your package has shipped" })],
      NOW,
    );
    expect(list.every((p) => p.status !== "delivered")).toBe(true);
  });

  it("drops mail that isn't shipping mail at all", () => {
    const list = classifyPackages([mail(), mail({ sender: "x", subject: "Newsletter", snippet: "" })], NOW);
    expect(list).toHaveLength(1);
  });

  it("sorts soonest-arriving first", () => {
    const list = classifyPackages(
      [
        mail({ subject: "Your package has shipped", snippet: "Arriving Monday", sender: "a@ups.com" }),
        mail({ subject: "Your package has shipped", snippet: "Arriving today", sender: "b@fedex.com" }),
      ],
      NOW,
    );
    expect(list[0].carrier).toBe("FedEx");
  });
});

vi.mock("@/lib/providers/google/gmail", () => ({
  googlePackageMail: vi.fn(),
}));

describe("getPackages", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an empty list rather than sample data when Google isn't connected", async () => {
    const { googlePackageMail } = await import("@/lib/providers/google/gmail");
    vi.mocked(googlePackageMail).mockResolvedValue(null);
    expect(await getPackages(NOW)).toEqual([]);
  });

  it("classifies whatever Gmail hands back", async () => {
    const { googlePackageMail } = await import("@/lib/providers/google/gmail");
    vi.mocked(googlePackageMail).mockResolvedValue([mail()]);
    const list = await getPackages(NOW);
    expect(list).toHaveLength(1);
    expect(list[0].carrier).toBe("Amazon");
  });

  it("returns an empty list rather than throwing when the fetch fails", async () => {
    const { googlePackageMail } = await import("@/lib/providers/google/gmail");
    vi.mocked(googlePackageMail).mockRejectedValue(new Error("network"));
    expect(await getPackages(NOW)).toEqual([]);
  });
});
