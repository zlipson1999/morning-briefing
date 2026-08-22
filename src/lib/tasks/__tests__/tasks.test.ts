import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeTask, normalizeTaskPayload, priorityFrom } from "@/lib/tasks/normalize";

let dir: string;

async function loadTasks() {
  vi.resetModules();
  return import("@/lib/tasks");
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "mb-tasks-"));
  vi.stubEnv("TASKS_STORE", path.join(dir, "tasks.json"));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.resetModules();
  await fs.rm(dir, { recursive: true, force: true });
});

describe("priorityFrom", () => {
  /** Todoist counts 4 (urgent) down to 1; most other sources send a word. */
  it("reads Todoist's numbers and everyone else's words", () => {
    expect(priorityFrom(4)).toBe("high");
    expect(priorityFrom("p1")).toBe("high");
    expect(priorityFrom(3)).toBe("medium");
    expect(priorityFrom("low")).toBe("low");
  });

  it("defaults to medium, because guessing low quietly buries work", () => {
    expect(priorityFrom(undefined)).toBe("medium");
    expect(priorityFrom("banana")).toBe("medium");
  });
});

describe("normalizeTask", () => {
  it("reads Todoist, Google Tasks and flattened shapes alike", () => {
    expect(normalizeTask({ content: "Chase the p99 spike", priority: 4 })?.title)
      .toBe("Chase the p99 spike");
    expect(normalizeTask({ title: "Chase the p99 spike", notes: "tokenizer" })?.note)
      .toBe("tokenizer");
    expect(normalizeTask({ task_name: "Chase it", due__date: "2026-08-21" })?.dueIso)
      .toBeTruthy();
  });

  /** A bare date is end of day, or everything due today reads as overdue. */
  it("treats a bare due date as the end of that day", () => {
    const due = new Date(normalizeTask({ title: "x", due: { date: "2026-08-21" } })!.dueIso!);
    expect(due.getHours()).toBe(23);
    expect(due.getMinutes()).toBe(59);
  });

  it("reads completion from a status or a flag", () => {
    expect(normalizeTask({ title: "x", status: "completed" })?.done).toBe(true);
    expect(normalizeTask({ title: "x", is_completed: true })?.done).toBe(true);
    expect(normalizeTask({ title: "x", checked: 1 })?.done).toBe(true);
    expect(normalizeTask({ title: "x" })?.done).toBe(false);
  });

  it("rejects a task with no title", () => {
    expect(normalizeTask({ due: "2026-08-21" })).toBeNull();
  });

  it("accepts a single task, a wrapped list, and a bare array", () => {
    const one = { title: "A" };
    expect(normalizeTaskPayload(one)).toHaveLength(1);
    expect(normalizeTaskPayload({ tasks: [one, { title: "B" }] })).toHaveLength(2);
    expect(normalizeTaskPayload([one, { nope: true }])).toHaveLength(1);
  });
});

describe("dueLabelFor", () => {
  it("says it the way a person would", async () => {
    const { dueLabelFor } = await loadTasks();
    const now = new Date(2026, 7, 21, 9, 0);

    expect(dueLabelFor(new Date(2026, 7, 21, 16, 30).toISOString(), now)).toBe("Today, 4:30 pm");
    expect(dueLabelFor(new Date(2026, 7, 21, 23, 59).toISOString(), now)).toBe("Today");
    expect(dueLabelFor(new Date(2026, 7, 20, 12, 0).toISOString(), now)).toBe("Yesterday");
    expect(dueLabelFor(new Date(2026, 7, 22, 12, 0).toISOString(), now)).toBe("Tomorrow");
    expect(dueLabelFor(null, now)).toBe("");
  });
});

describe("getTasks", () => {
  const task = (overrides: Record<string, unknown> = {}) => ({
    id: "t1",
    title: "Chase the p99 spike",
    dueIso: null,
    priority: "medium" as const,
    project: "pocket-ai",
    done: false,
    updatedAt: Date.now(),
    ...overrides,
  });

  it("falls back to the sample list so a fresh clone still works", async () => {
    const { getTasks } = await loadTasks();
    const list = await getTasks();

    expect(list.source).toBe("sample");
    expect(list.items.length).toBeGreaterThan(0);
    expect(list.syncedAt).toBeNull();
  });

  it("uses the pushed list once anything arrives", async () => {
    const { upsertTasks, getTasks } = await loadTasks();
    await upsertTasks([task()]);

    const list = await getTasks();
    expect(list.source).toBe("zapier");
    expect(list.items).toHaveLength(1);
    expect(list.syncedAt).toBeGreaterThan(0);
  });

  it("puts overdue first, then by due date, then by priority", async () => {
    const { upsertTasks, getTasks } = await loadTasks();
    const now = new Date(2026, 7, 21, 9, 0);

    await upsertTasks([
      task({ id: "later", title: "Later", dueIso: new Date(2026, 7, 21, 17, 0).toISOString() }),
      task({ id: "overdue", title: "Overdue", dueIso: new Date(2026, 7, 20, 9, 0).toISOString() }),
      task({ id: "soon", title: "Soon", dueIso: new Date(2026, 7, 21, 11, 0).toISOString() }),
      task({ id: "finished", title: "Finished", done: true }),
    ]);

    const list = await getTasks(now);
    expect(list.items.map((item) => item.title)).toEqual(["Overdue", "Soon", "Later", "Finished"]);
    expect(list.items[0].overdue).toBe(true);
  });

  it("never calls a completed task overdue", async () => {
    const { upsertTasks, getTasks } = await loadTasks();
    await upsertTasks([task({ done: true, dueIso: new Date(2020, 0, 1).toISOString() })]);

    expect((await getTasks()).items[0].overdue).toBe(false);
  });

  it("forgets tasks completed a fortnight ago", async () => {
    const { upsertTasks, getTasks } = await loadTasks();

    await upsertTasks([
      task({ id: "old", done: true, updatedAt: Date.now() - 14 * 24 * 60 * 60_000 }),
      task(),
    ]);

    expect((await getTasks()).items.map((item) => item.id)).toEqual(["t1"]);
  });
});
