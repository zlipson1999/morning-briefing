export type MilesAction =
  | { kind: "calendar.create"; title: string; start: string; end: string; location?: string }
  | { kind: "task.create"; title: string; due?: string }
  | { kind: "task.complete"; taskId: string; title: string }
  | { kind: "email.dismiss"; messageId: string; title: string }
  | { kind: "watchlist.add"; symbol: string }
  | { kind: "watchlist.remove"; symbol: string };

export type ActionProposal = { action: MilesAction; summary: string };

export function mightRequestAction(text: string) {
  return /\b(add|create|book|complete|finish|check off|dismiss|clear|remove|watch|unwatch)\b/i.test(text) ||
    /\bschedule\s+\w/i.test(text);
}

export function validProposal(value: unknown): ActionProposal | null {
  if (!value || typeof value !== "object") return null;
  const proposal = value as Partial<ActionProposal>;
  if (!proposal.action || typeof proposal.summary !== "string") return null;
  const action = proposal.action as Record<string, unknown>;
  if (typeof action.kind !== "string") return null;
  if (action.kind === "calendar.create") {
    return typeof action.title === "string" && typeof action.start === "string" && typeof action.end === "string"
      ? proposal as ActionProposal : null;
  }
  if (action.kind === "task.create") return typeof action.title === "string" ? proposal as ActionProposal : null;
  if (action.kind === "task.complete") {
    return typeof action.taskId === "string" && typeof action.title === "string" ? proposal as ActionProposal : null;
  }
  if (action.kind === "email.dismiss") {
    return typeof action.messageId === "string" && typeof action.title === "string" ? proposal as ActionProposal : null;
  }
  if (action.kind === "watchlist.add" || action.kind === "watchlist.remove") {
    return typeof action.symbol === "string" ? proposal as ActionProposal : null;
  }
  return null;
}

export function deterministicProposal(text: string): ActionProposal | null {
  const watch = /\b(add|remove|unwatch)\s+([A-Za-z][A-Za-z0-9.-]{0,11})\s+(?:to|from)\s+(?:my\s+)?watchlist\b/i.exec(text);
  if (watch) {
    const operation = watch[1].toLowerCase() === "add" ? "add" : "remove";
    const symbol = watch[2].toUpperCase();
    return {
      summary: `${operation === "add" ? "Add" : "Remove"} ${symbol} ${operation === "add" ? "to" : "from"} the watchlist.`,
      action: { kind: operation === "add" ? "watchlist.add" : "watchlist.remove", symbol },
    };
  }

  const task = /^\s*(?:add|create)\s+(?:a\s+)?(?:new\s+)?(?:task\s+(?:to\s+)?(?:my\s+)?(?:task\s+)?list\s*[:,-]?\s*|task\s*[:,-]?\s*)?(.+?)\s*$/i.exec(text);
  if (task) {
    const title = task[1]
      .replace(/\s+to\s+(?:my\s+)?task\s+list\s*$/i, "")
      .replace(/^task\s+/i, "")
      .trim();
    if (title) return { summary: `Add “${title}” to Google Tasks.`, action: { kind: "task.create", title } };
  }
  return null;
}

