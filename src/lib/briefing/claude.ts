import Anthropic from "@anthropic-ai/sdk";
import { cached } from "@/lib/cache";
import type { BriefingSnapshot } from "./snapshot";

/**
 * The Claude-authored briefing.
 *
 * The template composer lists what's in each panel. This one is asked to do
 * the thing a list can't: read across the sources and say what actually
 * matters — that the deck landed at 5:58 and the review is at 11, that the
 * only free hour is the one the overdue task needs, that today's drive is in
 * the rain. That cross-source judgement is the entire reason it's here.
 *
 * It is strictly an upgrade path: no key, a failure, or a slow response all
 * fall back to the deterministic text rather than costing you the briefing.
 */

const MODEL = "claude-opus-5";

const SYSTEM = `You write one person's spoken morning briefing. It is read aloud by a
speech engine the moment they sit down, so it has to work in the ear on a single pass.

Voice and shape:
- Plain spoken prose. No markdown, no bullets, no headings, no emoji, no stage directions.
- 110 to 170 words, in four to six sentences. Short sentences beat clauses.
- Second person, present tense, warm but not chatty. No filler openings beyond a brief greeting.
- Write numbers as a person would say them. Spell out symbols: "percent", "degrees", "dollars".
- Never invent a fact. If something is absent from the data, it does not exist. Never
  mention the data, the panels, the app, or your own reasoning.

Order, and what earns a sentence:
1. Anything that changes what you do in the next hour — an imminent leave-by time, an
   overdue item, a calendar conflict, severe weather. This goes first regardless.
2. Local news. What is happening where they live leads the briefing: two or three items
   at most, and only ones a person there would care about. Name the outlet.
3. Tasks — what they owe, overdue first.
4. Inbox — who is waiting on them, and what for.
5. The shape of the day: how many events, what is next, where the free time sits.
6. Weather, then the portfolio, then at most one item from the wider world.

Across all of it, prefer the connections a list of panels would never surface: an email
that is preparation for a meeting later today, a task whose only free window is a
specific gap in the calendar, a position moving on a story in the headlines. Those are
worth more than any single section, and they belong wherever they fit best.

Do not narrate every section. A section with nothing notable in it should be left out
entirely; the deterministic version already lists everything, so listing is not your job.
End on the single most useful thing to do first.`;

/** Regenerating word-for-word identical prose every 60s is pure waste. */
function cacheKey(snapshot: BriefingSnapshot): string {
  const salient = {
    hour: snapshot.now.hour,
    // Ten-minute buckets: fresh enough for a leave-by time, coarse enough
    // that a page refresh doesn't bill a new generation.
    bucket: Math.floor(snapshot.now.minutes / 10),
    schedule: snapshot.schedule.remaining,
    weather: snapshot.weather?.tempF,
    condition: snapshot.weather?.condition,
    tasks: snapshot.tasks.open,
    unread: snapshot.inbox.unread,
    portfolio: snapshot.portfolio?.dayChangePct?.toFixed(1),
    headline: snapshot.news.global[0]?.title,
    leaveIn: snapshot.commute?.leaveInMinutes,
  };
  return `briefing:${JSON.stringify(salient)}`;
}

export function claudeIsConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function composeWithClaude(snapshot: BriefingSnapshot): Promise<string | null> {
  if (!claudeIsConfigured()) return null;

  try {
    const { value } = await cached(cacheKey(snapshot), { ttlMs: 10 * 60_000 }, async () => {
      const client = new Anthropic();

      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM,
        // A short synthesis over a small payload: medium effort is the right
        // trade against a briefing that has to be spoken within seconds.
        output_config: { effort: "medium" },
        messages: [
          {
            role: "user",
            content:
              `Here is everything known about ${snapshot.userName}'s day. ` +
              `Write the briefing.\n\n` +
              JSON.stringify(snapshot, null, 2),
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
    });

    return value;
  } catch (error) {
    // Never fatal. The caller falls back to the deterministic briefing, which
    // is always available and always correct.
    console.error("[briefing:claude]", error);
    return null;
  }
}
