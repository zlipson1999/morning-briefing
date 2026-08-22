import Anthropic from "@anthropic-ai/sdk";
import type { Headline } from "./news";

/**
 * Ranks local headlines by what matters, not by what's newest.
 *
 * `rank()` in news.ts sorts by timestamp, which means a school board agenda
 * item and a hurricane warning are ordered by when the CMS published them.
 * For the panel that leads the briefing, that's the wrong sort.
 *
 * Claude gets the candidate list and picks — for someone who actually lives
 * there, in priority order, dropping what isn't worth their morning. Any
 * failure falls back to recency, so this is an upgrade path and never a
 * dependency.
 */

const MODEL = "claude-opus-5";

const SYSTEM = `You rank local news headlines for one resident's morning briefing.

You are given numbered headlines from their area's newsrooms. Return the ones worth their
morning, most important first.

Rank by consequence to someone who lives there:
- Highest: anything affecting their safety, movement or money today — storms and flooding,
  road and bridge closures, power and water outages, evacuations, crime near them, school
  closures.
- Then: decisions that change the place — council and county votes, development, taxes and
  utility rates, schools, hospitals, major employers.
- Then: genuinely notable local events and human-interest stories.
- Drop entirely: syndicated national politics that merely ran in a local outlet, sports
  recaps, listicles, horoscopes, real-estate promos, "best of" roundups, thin aggregation,
  and anything that is really an advertisement.

Recency is a tiebreaker, never the sort. Prefer variety: do not return several angles on
the same story.

Respond with a JSON array of the chosen headline numbers, most important first, and
nothing else. No prose, no code fence. Example: [7,2,15,4]`;

export function rankingIsConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Guards against a model returning junk, duplicates, or out-of-range indices. */
function parseOrder(text: string, count: number): number[] | null {
  const match = /\[[\s\S]*?\]/.exec(text);
  if (!match) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const seen = new Set<number>();
  const order: number[] = [];
  for (const entry of parsed) {
    const index = Number(entry) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= count || seen.has(index)) continue;
    seen.add(index);
    order.push(index);
  }
  return order.length > 0 ? order : null;
}

export async function rankByImportance(
  items: Headline[],
  place: string,
  limit: number,
): Promise<{ headlines: Headline[]; curated: boolean }> {
  const byRecency = { headlines: items.slice(0, limit), curated: false };
  if (!rankingIsConfigured() || items.length <= 1) return byRecency;

  try {
    const client = new Anthropic();

    const listing = items
      .map((item, index) => {
        const age = item.publishedAt
          ? `${Math.max(0, Math.round((Date.now() - item.publishedAt) / 3_600_000))}h old`
          : "age unknown";
        return `${index + 1}. ${item.title} — ${item.source}, ${age}` +
          (item.summary ? `\n   ${item.summary.slice(0, 160)}` : "");
      })
      .join("\n");

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: SYSTEM,
      // A judgement call over a short list — not a reasoning problem.
      output_config: { effort: "low" },
      messages: [
        {
          role: "user",
          content: `Reader lives in ${place}. Return at most ${limit} headline numbers.\n\n${listing}`,
        },
      ],
    });

    if (response.stop_reason === "refusal") throw new Error("refused");

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    const order = parseOrder(text, items.length);
    if (!order) throw new Error(`Unparseable ranking: ${text.slice(0, 120)}`);

    return { headlines: order.slice(0, limit).map((index) => items[index]), curated: true };
  } catch (error) {
    console.error("[news:rank]", error);
    return byRecency;
  }
}
