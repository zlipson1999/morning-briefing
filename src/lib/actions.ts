export type MilesAction =
  | { kind: "calendar.create"; title: string; start: string; end: string; location?: string }
  | { kind: "task.create"; title: string; due?: string }
  | { kind: "task.complete"; taskId: string; title: string }
  | { kind: "email.dismiss"; messageId: string; title: string }
  | { kind: "watchlist.add"; symbol: string }
  | { kind: "watchlist.remove"; symbol: string }
  | { kind: "memory.remember"; text: string }
  | { kind: "memory.forget"; query: string };

export type ActionProposal = { action: MilesAction; summary: string };

/**
 * A request only counts as an action when it *opens* with a command verb, once
 * the usual politeness is stripped. Matching the verb anywhere in the sentence
 * sent ordinary questions — "what should I watch tonight?" — through the
 * classifier first, so every one of them waited on a model round trip before
 * Miles said anything.
 */
const POLITE_LEAD =
  /^(?:\s*(?:hey\s+)?miles[,:]?\s+|\s*please\s+|\s*(?:can|could|would|will)\s+you\s+|\s*i(?:'d|\s+would)\s+like\s+you\s+to\s+|\s*i\s+need\s+you\s+to\s+|\s*(?:go\s+ahead\s+and|just)\s+)+/i;

const ACTION_LEAD =
  /^(?:add|create|book|schedule|complete|finish|check\s+off|dismiss|clear|remove|delete|watch|unwatch|remember|forget|put)\b/i;

/** The command itself, with any leading politeness removed. */
export function commandText(text: string): string {
  return text.replace(POLITE_LEAD, "").trimStart();
}

export function mightRequestAction(text: string) {
  return ACTION_LEAD.test(commandText(text));
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
  if (action.kind === "memory.remember") return typeof action.text === "string" ? proposal as ActionProposal : null;
  if (action.kind === "memory.forget") return typeof action.query === "string" ? proposal as ActionProposal : null;
  return null;
}

/** Questions that only mention memory ("Remember when we…") are not commands. */
const MEMORY_QUESTION = /^(?:when|what|whether|if|why|how|who|where|anything|everything)\b/i;

export function deterministicProposal(text: string): ActionProposal | null {
  const command = commandText(text);
  const asking = command.trimEnd().endsWith("?");

  const remember = /^remember(?:\s+that)?\s+(.+?)\s*$/i.exec(command);
  if (remember?.[1] && !asking && !MEMORY_QUESTION.test(remember[1])) {
    const memory = remember[1].trim();
    return { summary: `Remember “${memory}”.`, action: { kind: "memory.remember", text: memory } };
  }
  const forget = /^forget(?:\s+that|\s+about)?\s+(.+?)\s*$/i.exec(command);
  if (forget?.[1] && !asking && !MEMORY_QUESTION.test(forget[1])) {
    const query = forget[1].trim();
    return { summary: `Forget the memory matching “${query}”.`, action: { kind: "memory.forget", query } };
  }
  const watch = /\b(add|remove|unwatch)\s+([A-Za-z][A-Za-z0-9.-]{0,11})\s+(?:to|from)\s+(?:my\s+)?watchlist\b/i.exec(command);
  if (watch) {
    const operation = watch[1].toLowerCase() === "add" ? "add" : "remove";
    const symbol = watch[2].toUpperCase();
    return {
      summary: `${operation === "add" ? "Add" : "Remove"} ${symbol} ${operation === "add" ? "to" : "from"} the watchlist.`,
      action: { kind: operation === "add" ? "watchlist.add" : "watchlist.remove", symbol },
    };
  }

  // Only a request that actually names a task or a list becomes a task without
  // the model. "Create a poem about the sea" is not a task, and a confirmation
  // card standing in front of the answer is worse than a slower classification.
  const named = /^(?:add|create|put)\s+(?:a\s+)?(?:new\s+)?task\s*(?:to\s+|that\s+|for\s+|[:,-]\s*)?(.+?)\s*$/i.exec(command);
  const listed = /^(?:add|create|put)\s+(.+?)\s+(?:on|in|to)(?:to)?\s+(?:my\s+|the\s+)?(?:task|to-?do)s?(?:\s+list)?\s*$/i.exec(command);
  const title = (named?.[1] ?? listed?.[1])?.replace(/^task\s+/i, "").trim();
  if (title) return { summary: `Add “${title}” to Google Tasks.`, action: { kind: "task.create", title } };
  return null;
}

