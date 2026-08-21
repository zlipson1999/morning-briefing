import type { Priority, StoredTask } from "./types";

/**
 * Turns whatever a task Zap sends into a `StoredTask`.
 *
 * Todoist, Google Tasks and Things all name these fields differently, and
 * Zapier flattens nested ones with `__`. Rather than demand one shape, this
 * accepts the ones that actually turn up and rejects only what it can't read:
 * a task with no title.
 */

type Payload = Record<string, unknown>;

function field(payload: Payload, ...names: string[]): unknown {
  for (const name of names) {
    if (payload[name] !== undefined && payload[name] !== null) return payload[name];

    const flattened = payload[name.replace(".", "__")];
    if (flattened !== undefined && flattened !== null) return flattened;

    const [head, tail] = name.split(".");
    if (tail) {
      const parent = payload[head];
      if (parent && typeof parent === "object") {
        const value = (parent as Payload)[tail];
        if (value !== undefined && value !== null) return value;
      }
    }
  }
  return undefined;
}

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

function dueIso(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;

  // A bare date means end of that day, not midnight at the start of it —
  // otherwise everything due today reads as already overdue.
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T23:59:59`) : new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Todoist counts 4 (urgent) down to 1 (normal); most other sources send a
 * word. Anything unrecognised is medium, because guessing "low" quietly
 * buries work.
 */
export function priorityFrom(value: unknown): Priority {
  const raw = typeof value === "number" ? String(value) : text(value).toLowerCase();

  if (raw === "4" || raw === "urgent" || raw === "high" || raw === "p1") return "high";
  if (raw === "3" || raw === "medium" || raw === "p2") return "medium";
  if (raw === "1" || raw === "low" || raw === "none" || raw === "p4") return "low";
  return "medium";
}

function isDone(payload: Payload): boolean {
  const status = text(field(payload, "status", "state")).toLowerCase();
  if (status === "completed" || status === "done") return true;

  const flag = field(payload, "completed", "is_completed", "checked", "done");
  return flag === true || flag === 1 || text(flag).toLowerCase() === "true";
}

export function normalizeTask(payload: Payload): StoredTask | null {
  const title = text(field(payload, "title", "content", "name", "task", "task_name"));
  if (!title) return null;

  const note = text(field(payload, "note", "notes", "description", "body"));

  return {
    id:
      text(field(payload, "id", "task_id", "uid")) ||
      // No id means dedupe on content, so a resend overwrites itself.
      `${title}:${text(field(payload, "project", "project_name")) || "-"}`,
    title,
    note: note || undefined,
    dueIso: dueIso(field(payload, "due.date", "due.datetime", "due", "due_date", "dueDate", "deadline")),
    priority: priorityFrom(field(payload, "priority", "importance")),
    project: text(field(payload, "project", "project_name", "list", "list_name", "category")) || "Inbox",
    done: isDone(payload),
    updatedAt: Date.now(),
  };
}

export function normalizeTaskPayload(body: unknown): StoredTask[] {
  const candidates: unknown[] = Array.isArray(body)
    ? body
    : body && typeof body === "object" && Array.isArray((body as Payload).tasks)
      ? ((body as Payload).tasks as unknown[])
      : body && typeof body === "object"
        ? [body]
        : [];

  return candidates
    .filter((entry): entry is Payload => Boolean(entry) && typeof entry === "object")
    .map(normalizeTask)
    .filter((task): task is StoredTask => task !== null);
}
