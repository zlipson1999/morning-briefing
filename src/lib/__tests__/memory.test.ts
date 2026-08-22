import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forget, readMemories, remember, selectMemories, type Memory } from "@/lib/memory";

let directory = "";

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "miles-memory-"));
  vi.stubEnv("MEMORY_STORE", path.join(directory, "memory.json"));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(directory, { recursive: true, force: true });
});

describe("private memory", () => {
  it("persists, deduplicates and forgets an exact matching fact", async () => {
    const first = await remember("My dentist is Dr. Smith");
    const duplicate = await remember("my dentist is dr. smith");
    expect(duplicate.id).toBe(first.id);
    expect(await readMemories()).toHaveLength(1);

    await forget("dentist");
    expect(await readMemories()).toEqual([]);
  });

  it("refuses an ambiguous forget", async () => {
    await remember("Sam works in sales");
    await remember("Sam's birthday is June 3");
    await expect(forget("Sam")).rejects.toThrow("More than one memory");
  });
});

function memory(text: string, minutesAgo: number): Memory {
  return { id: text, text, createdAt: Date.UTC(2026, 7, 22, 12, 0) - minutesAgo * 60_000 };
}

describe("choosing which memories to spend context on", () => {
  const stored = [
    memory("My dentist is Dr. Smith on Ocean Boulevard", 500),
    memory("Sam's birthday is June 3", 400),
    memory("The garage door code is 4417", 300),
    memory("I take the Turnpike to the Orlando office", 200),
  ];

  it("keeps an old fact the question reaches for, past newer ones", () => {
    // Thirty newer facts would fill the budget on recency alone.
    const noise = Array.from({ length: 30 }, (_, index) => memory(`Unrelated note ${index} worth remembering`, 100 - index));
    const chosen = selectMemories([...stored, ...noise], "When is my dentist appointment?").map(({ text }) => text);

    expect(chosen.some((text) => text.includes("dentist"))).toBe(true);
    expect(chosen.some((text) => text.includes("garage"))).toBe(false);
  });

  it("matches a plural against the fact that was stored singular", () => {
    expect(selectMemories([memory("My dentist is Dr. Smith", 10)], "do dentists work saturdays?")).toHaveLength(1);
  });

  it("is not fooled into a match by ordinary filler words", () => {
    const chosen = selectMemories([memory("Sam's birthday is June 3", 10)], "What should I make for dinner?");
    // Nothing matched, so the newest facts fill the space instead of nothing.
    expect(chosen).toHaveLength(1);
  });

  it("keeps a large store from crowding out the snapshot", () => {
    const many = Array.from({ length: 100 }, (_, index) => memory(`Fact number ${index} about something`, 100 - index));
    const chosen = selectMemories(many, "what is on today?");

    expect(chosen.length).toBeLessThanOrEqual(12);
    expect(chosen.reduce((total, item) => total + item.text.length, 0)).toBeLessThanOrEqual(900);
    // Falling back to recency means the newest fact is always available.
    expect(chosen.at(-1)?.text).toBe("Fact number 99 about something");
  });

  it("hands them over oldest first", () => {
    const chosen = selectMemories(stored, "dentist and garage");
    expect(chosen.map(({ createdAt }) => createdAt)).toEqual([...chosen.map(({ createdAt }) => createdAt)].sort((a, b) => a - b));
  });
});
