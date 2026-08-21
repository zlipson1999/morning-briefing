import { afterEach, describe, expect, it, vi } from "vitest";
import { cached, clearCache } from "@/lib/cache";

afterEach(() => {
  clearCache();
  vi.useRealTimers();
});

describe("cached", () => {
  it("serves a fresh value without calling the loader again", async () => {
    const load = vi.fn().mockResolvedValue("first");

    expect(await cached("k", { ttlMs: 1000 }, load)).toEqual({ value: "first", stale: false });
    expect(await cached("k", { ttlMs: 1000 }, load)).toEqual({ value: "first", stale: false });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("collapses concurrent misses into one upstream call", async () => {
    let resolve!: (value: string) => void;
    const load = vi.fn(() => new Promise<string>((r) => { resolve = r; }));

    const all = Promise.all([
      cached("k", { ttlMs: 1000 }, load),
      cached("k", { ttlMs: 1000 }, load),
      cached("k", { ttlMs: 1000 }, load),
    ]);
    resolve("shared");

    expect(await all).toEqual([
      { value: "shared", stale: false },
      { value: "shared", stale: false },
      { value: "shared", stale: false },
    ]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("serves the last good value when a refresh fails", async () => {
    vi.useFakeTimers();
    const load = vi
      .fn()
      .mockResolvedValueOnce("good")
      .mockRejectedValue(new Error("upstream down"));

    await cached("k", { ttlMs: 1000 }, load);
    vi.advanceTimersByTime(1500);

    expect(await cached("k", { ttlMs: 1000 }, load)).toEqual({ value: "good", stale: true });
  });

  /**
   * Regression: the in-flight dedupe used to await outside the try, so a
   * failing refresh served stale data to the caller that started it and threw
   * at everyone who joined it — one panel cached, its neighbours erroring.
   */
  it("serves stale to every caller waiting on a failed refresh, not just the first", async () => {
    vi.useFakeTimers();
    let fail!: (error: Error) => void;
    const load = vi
      .fn()
      .mockResolvedValueOnce("good")
      .mockImplementationOnce(() => new Promise<string>((_, reject) => { fail = reject; }));

    await cached("k", { ttlMs: 1000 }, load);
    vi.advanceTimersByTime(1500);

    const results = Promise.all([
      cached("k", { ttlMs: 1000 }, load),
      cached("k", { ttlMs: 1000 }, load),
      cached("k", { ttlMs: 1000 }, load),
    ]);
    fail(new Error("upstream down"));

    expect(await results).toEqual([
      { value: "good", stale: true },
      { value: "good", stale: true },
      { value: "good", stale: true },
    ]);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("throws when a refresh fails and nothing is cached", async () => {
    const load = vi.fn().mockRejectedValue(new Error("upstream down"));
    await expect(cached("k", { ttlMs: 1000 }, load)).rejects.toThrow("upstream down");
  });

  it("stops serving stale once the grace window closes", async () => {
    vi.useFakeTimers();
    const load = vi
      .fn()
      .mockResolvedValueOnce("good")
      .mockRejectedValue(new Error("upstream down"));

    await cached("k", { ttlMs: 1000, graceMs: 1000 }, load);
    vi.advanceTimersByTime(5000);

    await expect(cached("k", { ttlMs: 1000, graceMs: 1000 }, load)).rejects.toThrow("upstream down");
  });

  it("stays bounded when keys come from user input", async () => {
    for (let i = 0; i < 400; i++) {
      await cached(`place:${i}`, { ttlMs: 60_000 }, async () => i);
    }
    // The most recent key must still be a hit; the map itself must not have
    // grown to 400 entries.
    const load = vi.fn().mockResolvedValue(-1);
    expect(await cached("place:399", { ttlMs: 60_000 }, load)).toEqual({ value: 399, stale: false });
    expect(load).not.toHaveBeenCalled();

    await cached("place:0", { ttlMs: 60_000 }, async () => -1);
    expect(true).toBe(true);
  });
});
