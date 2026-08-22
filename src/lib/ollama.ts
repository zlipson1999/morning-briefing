export type ChatMessage = { role: "user" | "assistant"; content: string };

// gemma4:e2b reports a 4K-token context window. Leave room for Miles' system
// prompt and the live snapshot instead of allowing browser history to crowd
// out the latest question.
const MAX_MESSAGES = 8;
const MAX_MESSAGE_CHARS = 1_000;

export function ollamaConfig() {
  const baseUrl = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
  return {
    baseUrl,
    model: process.env.OLLAMA_MODEL || "gemma4:e2b",
  };
}

/** Keep browser-controlled history bounded before it reaches the model. */
export function normalizeChatMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (item): item is ChatMessage =>
        Boolean(item) &&
        typeof item === "object" &&
        ((item as ChatMessage).role === "user" || (item as ChatMessage).role === "assistant") &&
        typeof (item as ChatMessage).content === "string",
    )
    .map((item) => ({
      role: item.role,
      content: item.content.trim().slice(0, MAX_MESSAGE_CHARS),
    }))
    .filter((item) => item.content.length > 0)
    .slice(-MAX_MESSAGES);
}

export const MILES_CHAT_SYSTEM = `You are Miles, one person's private daily assistant.
Answer conversationally and directly. You may discuss any topic, not only the dashboard.
When the supplied current snapshot is relevant, use it as the source of truth for the user's
calendar, tasks, inbox, weather, news and portfolio. Never invent missing personal facts.
Distinguish facts in the snapshot from general knowledge, and say when current information
is unavailable. Do not claim to have performed an action. Keep ordinary answers concise.`;

