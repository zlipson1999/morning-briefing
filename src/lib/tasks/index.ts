import { initialTasks } from "@/lib/data";
import { createPushStore } from "@/lib/push/store";
import type { StoredTask, TaskItem } from "./types";

export * from "./types";
export { normalizeTask, normalizeTaskPayload, priorityFrom } from "./normalize";

/** A task finished a week ago is history, not a list. */
const KEEP_DONE_MS = 7 * 24 * 60 * 60_000;

const store = createPushStore<StoredTask>({
  name: "tasks",
  envVar: "TASKS_STORE",
  isExpired: (task) => task.done && Date.now() - task.updatedAt > KEEP_DONE_MS,
});

export const upsertTasks = store.upsert;
export const removeTask = store.remove;
export const clearTasks = store.clear;
export const readTaskStore = store.read;

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

/** Spoken the way a person would say it, not as a date stamp. */
export function dueLabelFor(dueIso: string | null, now: Date): string {
  if (!dueIso) return "";
  const due = new Date(dueIso);
  if (Number.isNaN(due.getTime())) return "";

  const yesterday = new Date(now.getTime() - 24 * 60 * 60_000);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60_000);

  const clock = due.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
  // 11:59pm is our own stand-in for "sometime that day", not a real time.
  const endOfDay = due.getHours() === 23 && due.getMinutes() === 59;

  if (sameDay(due, now)) return endOfDay ? "Today" : `Today, ${clock}`;
  if (sameDay(due, yesterday)) return "Yesterday";
  if (sameDay(due, tomorrow)) return "Tomorrow";
  if (due < now) return due.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return due.toLocaleDateString("en-US", { weekday: "short" });
}

function toItem(task: StoredTask, now: Date): TaskItem {
  const dueAt = task.dueIso ? Date.parse(task.dueIso) : null;
  return {
    id: task.id,
    title: task.title,
    note: task.note,
    dueLabel: dueLabelFor(task.dueIso, now),
    dueAt: dueAt !== null && !Number.isNaN(dueAt) ? dueAt : null,
    overdue: !task.done && dueAt !== null && !Number.isNaN(dueAt) && dueAt < now.getTime(),
    priority: task.priority,
    project: task.project,
    done: task.done,
  };
}

/**
 * The sample list uses human due labels rather than dates, so it's converted
 * rather than parsed — the point of it is to demo the panel, not to be real.
 */
function sampleItems(): TaskItem[] {
  return initialTasks.map((task) => ({
    id: task.id,
    title: task.title,
    note: task.note,
    dueLabel: task.due,
    dueAt: null,
    overdue: !task.done && task.due.toLowerCase() === "yesterday",
    priority: task.priority,
    project: task.project,
    done: task.done,
  }));
}

const RANK: Record<TaskItem["priority"], number> = { high: 0, medium: 1, low: 2 };

export type TaskList = {
  items: TaskItem[];
  source: "zapier" | "sample";
  syncedAt: number | null;
};

export async function getTasks(now: Date = new Date()): Promise<TaskList> {
  const { items, updatedAt } = await store.read();
  const stored = Object.values(items);

  if (stored.length === 0) {
    return { items: sampleItems(), source: "sample", syncedAt: null };
  }

  const list = stored
    .map((task) => toItem(task, now))
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      if (a.dueAt !== b.dueAt) return (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity);
      return RANK[a.priority] - RANK[b.priority];
    });

  return { items: list, source: "zapier", syncedAt: updatedAt || null };
}
