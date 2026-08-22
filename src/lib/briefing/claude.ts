import Anthropic from "@anthropic-ai/sdk";
import { cached } from "@/lib/cache";
import { describeFactsForPrompt, type NowContext } from "./now";
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

const MORNING_SYSTEM = `You are Miles — one person's briefing assistant; the name stands for
"My Integrated Life Efficiency System", but you never say the acronym out loud. You may refer
to yourself as Miles at most once, naturally, or not at all — the briefing is about their day,
not about you.

You write one person's spoken morning briefing. It is read aloud by a
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
5. A package arriving today, if there is one — one brief mention, never more.
6. The shape of the day: how many events, what is next, where the free time sits.
7. Weather, then the portfolio, then at most one item from the wider world.

Across all of it, prefer the connections a list of panels would never surface: an email
that is preparation for a meeting later today, a task whose only free window is a
specific gap in the calendar, a position moving on a story in the headlines. Those are
worth more than any single section, and they belong wherever they fit best.

Do not narrate every section. A section with nothing notable in it should be left out
entirely; the deterministic version already lists everything, so listing is not your job.
End on the single most useful thing to do first.`;

const NOW_SYSTEM = `You are Miles, one person's briefing assistant. Do not introduce yourself —
they may literally have just said your name to summon you.

You write a short spoken update for someone who already heard their full
morning briefing today and has just opened the dashboard again.

They know what today looks like. Do not tell them again. No weather forecast, no headlines,
no run-through of the day's events, no greeting beyond none at all — start with the time.

Answer one question: what now?

- Lead with the time, and what they are in the middle of if anything.
- Then anything that needs them to move or act within the next few hours: a leave-by time,
  something starting soon, an overdue task, a flagged message that arrived recently.
- Name what is next and how long away it is.
- If nothing needs them, say so plainly and stop. A short update is the correct output when
  nothing has changed; padding it is worse than silence.

You are given two lists. Say what is under "worth saying now". Do not restate anything under
"already said" — they heard it, it has not changed, and repeating it is the exact thing this
update exists to avoid. If the first list is empty, say so in one sentence and stop.

Two to four sentences, 40 to 90 words. Plain spoken prose — no markdown, no bullets, no
lists. Second person, present tense. Numbers as a person would say them: "percent",
"degrees", "dollars". Never invent a fact; if something is absent from the data it does not
exist. Never mention the data, the panels, the app, or your own reasoning.`;

export type BriefingMode = "morning" | "now" | "evening";

const EVENING_SYSTEM = `You are Miles, one person's briefing assistant. They just asked for the
evening wind-down — "goodnight", or the first time they've opened this today past 8pm.

This looks backward over the day, not forward: how much got done, and one thing about
tomorrow. It is not the morning briefing and does not repeat it — no weather, no news, no
run-through of today's meetings.

Say, in this order, whatever of it is genuinely present in the data:
1. How today's tasks went — how many got done, out of how many. If nothing got done, say so
   plainly rather than dwelling on it; tomorrow is a fresh start, not a scolding.
2. Where the portfolio or watchlist closed, if it's connected and moved.
3. What tomorrow opens with — the first thing on the calendar, or that nothing's there yet.

Leave out anything the data doesn't have — don't pad with a fact-free sentence just to fill
a slot. Two to four sentences, 40 to 90 words. Plain spoken prose, second person, present
tense. Numbers as a person would say them: "percent", "degrees", "dollars". Never invent a
fact. A brief "good evening" is fine to open with; nothing more.`;

/** Regenerating word-for-word identical prose every 60s is pure waste. */
function cacheKey(snapshot: BriefingSnapshot, mode: BriefingMode): string {
  const salient = {
    mode,
    hour: snapshot.now.hour,
    // Ten-minute buckets: fresh enough for a leave-by time, coarse enough
    // that a page refresh doesn't bill a new generation.
    bucket: Math.floor(snapshot.now.minutes / 10),
    schedule: snapshot.schedule.remaining,
    weather: snapshot.weather?.tempF,
    condition: snapshot.weather?.condition,
    tasksOpen: snapshot.tasks.open,
    tasksDone: snapshot.tasks.done,
    unread: snapshot.inbox.unread,
    portfolio: snapshot.portfolio?.dayChangePct?.toFixed(1),
    headline: snapshot.news.global[0]?.title,
    leaveIn: snapshot.commute?.leaveInMinutes,
    tomorrow: snapshot.tomorrow?.firstEvent?.title,
  };
  return `briefing:${JSON.stringify(salient)}`;
}

export function claudeIsConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function composeWithClaude(
  snapshot: BriefingSnapshot,
  mode: BriefingMode = "morning",
  context: NowContext = {},
): Promise<string | null> {
  if (!claudeIsConfigured()) return null;

  try {
    const facts = mode === "now" ? describeFactsForPrompt(snapshot, context) : "";
    const key = mode === "now" ? `briefing:now:${facts}` : cacheKey(snapshot, mode);

    const { value } = await cached(key, { ttlMs: 10 * 60_000 }, async () => {
      const client = new Anthropic();

      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: mode === "now" ? NOW_SYSTEM : mode === "evening" ? EVENING_SYSTEM : MORNING_SYSTEM,
        // A short synthesis over a small payload: medium effort is the right
        // trade against a briefing that has to be spoken within seconds.
        output_config: { effort: "medium" },
        messages: [
          {
            role: "user",
            content:
              mode === "now"
                ? `It is ${snapshot.now.time}. ${snapshot.userName} already heard the full ` +
                  `briefing this morning and has just reopened the dashboard. Write the update.` +
                  `\n\n${facts}\n\nFull context:\n${JSON.stringify(snapshot, null, 2)}`
                : mode === "evening"
                  ? `${snapshot.userName} asked for the evening wind-down. Write it.\n\n` +
                    JSON.stringify(snapshot, null, 2)
                  : `Here is everything known about ${snapshot.userName}'s day. ` +
                    `Write the briefing.\n\n${JSON.stringify(snapshot, null, 2)}`,
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
