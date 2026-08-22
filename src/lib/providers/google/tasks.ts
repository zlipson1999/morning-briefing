import { cached } from "@/lib/cache";
import { dueLabelFor, type TaskItem } from "@/lib/tasks";
import { googleGet, googleIsConnected, googleRequest } from "./auth";

/**
 * Open work, straight from the Google Tasks API.
 *
 * Google Tasks has no priority field, so everything arrives medium — the
 * sort still puts overdue first and nearest due date next, which is the
 * ordering that actually matters in a briefing.
 */

type ApiTask = {
  id?: string;
  title?: string;
  notes?: string;
  due?: string;
  status?: string;
  updated?: string;
};

type ApiList = { id?: string; title?: string };

export function mapGoogleTask(task: ApiTask, listTitle: string, now: Date): TaskItem | null {
  if (!task?.title?.trim()) return null;

  // Google's `due` is date-only with a fake midnight-UTC clock. Read the date
  // and call it end-of-day local, or everything due today reads as overdue.
  let dueAt: number | null = null;
  let dueIso: string | null = null;
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(task.due ?? "");
  if (day) {
    const local = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]), 23, 59, 59);
    dueAt = local.getTime();
    dueIso = local.toISOString();
  }

  const done = task.status === "completed";

  return {
    id: task.id ?? `${task.title}:${listTitle}`,
    title: task.title.trim(),
    note: task.notes?.trim() || undefined,
    dueLabel: dueLabelFor(dueIso, now),
    dueAt,
    overdue: !done && dueAt !== null && dueAt < now.getTime(),
    priority: "medium",
    project: listTitle,
    done,
  };
}

export async function googleTasks(now: Date): Promise<TaskItem[] | null> {
  if (!(await googleIsConnected())) return null;

  const { value } = await cached("google:tasks", { ttlMs: 3 * 60_000 }, async () => {
    const listsBody = await googleGet(
      "https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=10",
    );
    if (!listsBody) throw new Error("Google Tasks: not connected");

    const lists = ((listsBody.items as ApiList[]) ?? []).filter((list) => list.id);

    const perList = await Promise.all(
      lists.map(async (list) => {
        const body = await googleGet(
          `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(list.id!)}/tasks` +
            "?showCompleted=true&showHidden=false&maxResults=50",
        );
        return ((body?.items as ApiTask[]) ?? [])
          .map((task) => mapGoogleTask(task, list.title ?? "Tasks", now))
          .filter((task): task is TaskItem => task !== null);
      }),
    );

    const RANK = { high: 0, medium: 1, low: 2 } as const;
    return perList.flat().sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      if (a.dueAt !== b.dueAt) return (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity);
      return RANK[a.priority] - RANK[b.priority];
    });
  });
  return value;
}

async function firstTaskListId(): Promise<string> {
  const body = await googleGet("https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=10");
  const first = ((body?.items as ApiList[]) ?? []).find((list) => list.id);
  if (!first?.id) throw new Error("Google Tasks has no task list available.");
  return first.id;
}

export async function createGoogleTask(input: { title: string; due?: string }) {
  if (!input.title.trim()) throw new Error("The task needs a title.");
  const listId = await firstTaskListId();
  const due = input.due ? new Date(input.due) : null;
  return googleRequest(
    `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks`,
    "POST",
    {
      title: input.title.trim().slice(0, 300),
      due: due && !Number.isNaN(due.getTime()) ? due.toISOString() : undefined,
    },
  );
}

export async function completeGoogleTask(taskId: string) {
  const listsBody = await googleGet("https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=10");
  const lists = ((listsBody?.items as ApiList[]) ?? []).filter((list) => list.id);
  for (const list of lists) {
    const body = await googleGet(
      `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(list.id!)}/tasks?showCompleted=false&maxResults=100`,
    );
    const match = ((body?.items as ApiTask[]) ?? []).find((task) => task.id === taskId);
    if (match?.id) {
      return googleRequest(
        `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(list.id!)}/tasks/${encodeURIComponent(match.id)}`,
        "PATCH",
        { status: "completed", completed: new Date().toISOString() },
      );
    }
  }
  throw new Error("That open Google task could not be found.");
}

