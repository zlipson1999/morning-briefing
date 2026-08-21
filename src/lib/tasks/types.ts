export type Priority = "high" | "medium" | "low";

/** A task as it's kept on disk. */
export type StoredTask = {
  id: string;
  title: string;
  note?: string;
  /** Full ISO, or null for something with no due date at all. */
  dueIso: string | null;
  priority: Priority;
  project: string;
  done: boolean;
  updatedAt: number;
};

/** What the panel and the briefing read. */
export type TaskItem = {
  id: string;
  title: string;
  note?: string;
  /** "Today, 4:30pm", "Tomorrow", "Yesterday", or "" for no due date. */
  dueLabel: string;
  dueAt: number | null;
  overdue: boolean;
  priority: Priority;
  project: string;
  done: boolean;
};
