import Anthropic from "@anthropic-ai/sdk";
import type { BriefingSnapshot } from "./snapshot";

/**
 * "Hey Miles, …" — freeform.
 *
 * The wake word used to understand a handful of commands and fall through to
 * the short update for everything else. This is the wider version: any real
 * question gets answered from the same snapshot every other composer reads,
 * grounded and short, because a dashboard that only understands five phrases
 * isn't really an assistant.
 *
 * There is no deterministic floor here — a freeform question genuinely needs
 * a model to parse it. Without one, the honest answer is that it's off, not
 * a guess at what was asked.
 */

const MODEL = "claude-opus-5";

const ASK_SYSTEM = `You are Miles, one person's briefing assistant. They just asked you a spoken
question — you may have literally just heard "Hey Miles" — about their day.

Answer only from the JSON snapshot you're given: their calendar, inbox, tasks, weather, news,
portfolio and commute. Never invent a fact. If the data doesn't contain the answer, say so
plainly in one sentence rather than guessing — "I don't see anything about that today" beats
a wrong answer.

One to three sentences. Plain spoken prose — no markdown, no lists, no headings. Answer the
question directly first; add context only if it's genuinely useful. Numbers as a person would
say them: "percent", "degrees", "dollars". Do not greet them or introduce yourself — they know
who they're talking to.`;

export function askIsConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function composeAnswer(snapshot: BriefingSnapshot, question: string): Promise<string> {
  const asked = question.trim();
  if (!asked) return "I didn't catch a question there.";

  if (!askIsConfigured()) {
    return "Asking questions needs a Claude key — add ANTHROPIC_API_KEY in .env.local to turn it on.";
  }

  try {
    const client = new Anthropic();

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: ASK_SYSTEM,
      // A lookup over a small payload, not a reasoning problem.
      output_config: { effort: "low" },
      messages: [
        {
          role: "user",
          content: `Question: ${asked}\n\nToday's data:\n${JSON.stringify(snapshot, null, 2)}`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      throw new Error(`Refused: ${response.stop_details?.category ?? "unknown"}`);
    }

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

    if (!text) throw new Error("Claude returned no text");
    return text;
  } catch (error) {
    // Never fatal — the wake word still answers with something spoken.
    console.error("[briefing:ask]", error);
    return "I couldn't work that out just now — try asking again in a moment.";
  }
}
