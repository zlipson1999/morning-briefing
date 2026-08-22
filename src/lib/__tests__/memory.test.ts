import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forget, readMemories, remember } from "@/lib/memory";

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

