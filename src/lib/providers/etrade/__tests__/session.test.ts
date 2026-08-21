import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetSealingKey, seal, sealingIsDurable, unseal } from "../seal";
import { readPending, readSession, sealPending, sealSession } from "../session";

const TOKEN = { key: "abc123", secret: "s3cr3t" };

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "a-long-enough-test-secret");
  resetSealingKey();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  resetSealingKey();
});

describe("seal", () => {
  it("round-trips a payload", () => {
    expect(unseal(seal({ hello: "world" }))).toEqual({ hello: "world" });
  });

  it("never leaves the payload readable in the cookie value", () => {
    expect(seal(TOKEN)).not.toContain("s3cr3t");
  });

  it("rejects a tampered value rather than decrypting it", () => {
    const sealed = seal(TOKEN);
    const flipped = sealed.slice(0, -4) + (sealed.slice(-4) === "AAAA" ? "BBBB" : "AAAA");
    expect(unseal(flipped)).toBeNull();
  });

  it("rejects junk, empty and absent values", () => {
    expect(unseal("not-a-cookie")).toBeNull();
    expect(unseal("")).toBeNull();
    expect(unseal(undefined)).toBeNull();
  });

  it("cannot open a value sealed under a different key", () => {
    const sealed = seal(TOKEN);
    vi.stubEnv("SESSION_SECRET", "an-entirely-different-secret");
    resetSealingKey();
    expect(unseal(sealed)).toBeNull();
  });

  it("reports whether sealed values can outlive the process", () => {
    expect(sealingIsDurable()).toBe(true);
    vi.stubEnv("SESSION_SECRET", "");
    resetSealingKey();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(sealingIsDurable()).toBe(false);
  });
});

describe("readSession", () => {
  it("returns the token it was given", () => {
    expect(readSession(sealSession(TOKEN))).toEqual({ status: "ok", token: TOKEN });
  });

  it("distinguishes never-connected from expired", () => {
    expect(readSession(undefined)).toEqual({ status: "none" });
    expect(readSession("garbage")).toEqual({ status: "expired" });
  });

  /**
   * E*TRADE kills every access token at midnight US Eastern. Expiring ours on
   * the same boundary is what turns a 401 into a "reconnect" prompt.
   */
  it("expires a token minted on a previous Eastern day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-21T12:00:00Z"));
    const sealed = sealSession(TOKEN);

    vi.setSystemTime(new Date("2026-08-22T12:00:00Z"));
    expect(readSession(sealed)).toEqual({ status: "expired" });
  });

  it("keeps a token across a UTC midnight that isn't an Eastern one", () => {
    vi.useFakeTimers();
    // 8pm Eastern on the 21st...
    vi.setSystemTime(new Date("2026-08-22T00:30:00Z"));
    const sealed = sealSession(TOKEN);
    // ...and 9pm Eastern, still the same trading day.
    vi.setSystemTime(new Date("2026-08-22T01:30:00Z"));

    expect(readSession(sealed)).toEqual({ status: "ok", token: TOKEN });
  });
});

describe("readPending", () => {
  it("returns the request token during the OAuth round trip", () => {
    expect(readPending(sealPending(TOKEN))).toEqual(TOKEN);
  });

  it("drops a request token left sitting for a quarter of an hour", () => {
    vi.useFakeTimers();
    const sealed = sealPending(TOKEN);
    vi.advanceTimersByTime(16 * 60_000);
    expect(readPending(sealed)).toBeNull();
  });

  it("refuses anything that isn't a token", () => {
    expect(readPending(seal({ token: { key: "" }, createdAt: Date.now() }))).toBeNull();
    expect(readPending(undefined)).toBeNull();
  });
});
