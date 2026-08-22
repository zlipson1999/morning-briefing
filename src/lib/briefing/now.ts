import { endSentence } from "./prose";
import { recentEmailDigest } from "./emailDigest";
import type { BriefingSnapshot } from "./snapshot";

/**
 * The short update you get on every open after the first one today.
 *
 * Two separate jobs, which is why this is built as facts rather than prose:
 *
 *   - Scope to the moment. The morning briefing covered the day; by 3pm the
 *     only question left is *what now*.
 *   - Don't say the same thing twice. Each fact carries a stable key and an
 *     urgency, so an update at 9:20 skips what the one at 9:00 already said —
 *     unless the fact has actually changed, in which case it earns a second
 *     mention. "You should leave in forty minutes" becoming "leave now" is
 *     new information; the same sentence again is not.
 *
 * The renderer and the Claude prompt both read these facts, so the two paths
 * suppress and re-raise identically.
 */

/** How far ahead counts as "coming up" rather than "later today". */
const HORIZON_MINUTES = 180;

/** Mail older than this was part of the morning, not part of now. */
const RECENT_MAIL_MS = 3 * 60 * 60_000;

export type NowFact = {
  /** Stable across updates for the same underlying fact. */
  key: string;
  text: string;
  /** Bumped when the fact changes enough to be worth repeating. */
  stage: string;
  /** True when this is the first time you'd be hearing it. */
  fresh: boolean;
};

export type NowContext = {
  /** When the last update was spoken, in epoch ms. */
  since?: number | null;
  /** `key@stage` for everything already said today. */
  said?: string[];
};

export type NowBrief = {
  text: string;
  /** Feed back as `said` next time. */
  keys: string[];
};

export function composeNow(snapshot: BriefingSnapshot, context: NowContext = {}): NowBrief {
  const said = new Set(context.said ?? []);
  const facts = notableNow(snapshot, context).map((fact) => ({
    ...fact,
    fresh: !said.has(`${fact.key}@${fact.stage}`),
  }));

  const keys = facts.map((fact) => `${fact.key}@${fact.stage}`);
  const worthSaying = facts.filter((fact) => fact.fresh);

  // The opening line is always the time — it is what the reader asked for by
  // reopening — but it is not a "fact" and never counts as repetition.
  const opener = openingLine(snapshot);

  if (worthSaying.length === 0) {
    return { text: `${opener}\n\nNothing new since you last looked.`, keys };
  }

  return { text: [opener, ...worthSaying.map((fact) => fact.text)].join("\n\n"), keys };
}

function openingLine(snapshot: BriefingSnapshot): string {
  const live = snapshot.schedule.events.find((event) => event.status === "now");
  return endSentence(
    `It's ${snapshot.now.time}.` + (live ? ` You're in ${live.title} until ${live.end}` : ""),
  );
}

/**
 * Everything about this moment that could be worth a sentence, in the order
 * it should be said. Suppression happens above; this only decides what's true.
 */
function notableNow(snapshot: BriefingSnapshot, context: NowContext): Omit<NowFact, "fresh">[] {
  const { schedule, inbox, tasks, commute, weather, now } = snapshot;
  const facts: Omit<NowFact, "fresh">[] = [];
  const since = context.since ?? null;

  // 1. The thing that needs you to move.
  if (commute && commute.leaveInMinutes <= HORIZON_MINUTES) {
    facts.push({
      key: `leave:${commute.destination}`,
      // Three stages, so the countdown is re-announced as it gets serious
      // rather than once at the start and never again.
      stage: commute.leaveInMinutes < 0 ? "late" : commute.leaveInMinutes <= 15 ? "now" : "soon",
      text:
        commute.leaveInMinutes >= 0
          ? `Leave in ${commute.leaveInMinutes} minutes for ${commute.destination} — ` +
            `about a ${commute.driveMinutes} minute drive.`
          : `You're ${Math.abs(commute.leaveInMinutes)} minutes past when you should have left ` +
            `for ${commute.destination}.`,
    });
  }

  // 2. What's next.
  const next = schedule.events.find((event) => event.status === "upcoming");
  const live = schedule.events.find((event) => event.status === "now");

  if (!next) {
    facts.push({
      key: "schedule:empty",
      stage: live ? "in-event" : "clear",
      text: live ? "Nothing after that." : "Nothing else on the calendar today.",
    });
  } else {
    const away = minutesUntil(next.start, now.minutes);
    const imminent = away !== null && away <= HORIZON_MINUTES;
    facts.push({
      key: `next:${next.title}`,
      // Inside a quarter of an hour it's a different message to "in 2h 15m".
      stage: away === null ? "unknown" : away <= 15 ? "imminent" : imminent ? "soon" : "later",
      text: endSentence(
        imminent
          ? `Next is ${next.title} at ${next.start}, ${describeGap(away!)}` +
            (next.location ? `, ${next.location}` : "")
          : `Nothing until ${next.title} at ${next.start}`,
      ),
    });
  }

  if (schedule.conflicts.length > 0) {
    const clash = schedule.conflicts[0];
    facts.push({
      key: `conflict:${clash.a}|${clash.b}`,
      stage: "open",
      text: `${clash.a} still overlaps ${clash.b}.`,
    });
  }

  // 3. Work due about now. Crossing into overdue is a new stage, so a task
  //    mentioned as "due today" is mentioned again once it's late.
  const pressing = tasks.items.filter((task) => task.overdue || isDueSoon(task.due));
  if (pressing.length) {
    facts.push({
      key: `tasks:${pressing[0].title}`,
      stage: `${pressing[0].overdue ? "overdue" : "due"}:${pressing.length}`,
      text:
        pressing.length === 1
          ? `Still open: ${pressing[0].title}${pressing[0].overdue ? ", overdue" : ""}.`
          : `Still open: ${pressing[0].title}, and ${pressing.length - 1} other ` +
            `${pressing.length === 2 ? "thing" : "things"} due about now.`,
    });
  }

  // 4. Mail. `since` is what makes this a delta rather than a window: on a
  //    second look twenty minutes later, only what landed in those twenty
  //    minutes counts as news.
  const arrivedSince = inbox.messages.filter(
    (message) =>
      message.important &&
      typeof message.receivedAt === "number" &&
      (since !== null ? message.receivedAt > since : isRecent(message.receivedAt)),
  );
  if (arrivedSince.length) {
    facts.push({
      key: `mail:${arrivedSince.map((message) => message.sender).join("|")}`,
      stage: String(arrivedSince.length),
      text: recentEmailDigest(arrivedSince),
    });
  }

  // 5. Weather, only when it changes what you'd do in the next few hours.
  if (weather && (weather.precipChance >= 60 || isSevere(weather.code))) {
    facts.push({
      key: "weather:alert",
      stage: isSevere(weather.code) ? `severe:${weather.code}` : `rain:${weather.precipChance}`,
      text: isSevere(weather.code)
        ? `${weather.condition} outside — worth knowing before you drive.`
        : `${weather.precipChance} percent chance of rain — take something.`,
    });
  }

  return facts;
}

/** What Claude is told, so its output suppresses and re-raises identically. */
export function describeFactsForPrompt(snapshot: BriefingSnapshot, context: NowContext): string {
  const said = new Set(context.said ?? []);
  const facts = notableNow(snapshot, context);

  const fresh = facts.filter((fact) => !said.has(`${fact.key}@${fact.stage}`));
  const repeats = facts.filter((fact) => said.has(`${fact.key}@${fact.stage}`));

  return [
    fresh.length
      ? `Worth saying now:\n${fresh.map((fact) => `- ${fact.text}`).join("\n")}`
      : "Nothing has changed since the last update.",
    repeats.length
      ? `\nAlready said, unchanged — do not repeat:\n${repeats.map((fact) => `- ${fact.text}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** The keys the caller should remember, whichever composer wrote the prose. */
export function nowKeys(snapshot: BriefingSnapshot, context: NowContext = {}): string[] {
  return notableNow(snapshot, context).map((fact) => `${fact.key}@${fact.stage}`);
}

function minutesUntil(spokenTime: string, nowMinutes: number): number | null {
  // Snapshot times are already spoken ("11 a.m.", "4:30 p.m."), so read back.
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(a\.m\.|p\.m\.)$/.exec(spokenTime.trim());
  if (!match) return null;

  let hours = Number(match[1]) % 12;
  if (match[3] === "p.m.") hours += 12;

  return hours * 60 + Number(match[2] ?? 0) - nowMinutes;
}

function describeGap(minutes: number): string {
  if (minutes <= 0) return "starting now";
  if (minutes < 60) return `in ${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `in ${hours} ${hours === 1 ? "hour" : "hours"}` : `in ${hours}h ${rest}m`;
}

function isDueSoon(due: string): boolean {
  return /^today/i.test(due.trim());
}

function isRecent(receivedAt: number): boolean {
  return Date.now() - receivedAt <= RECENT_MAIL_MS;
}

/** Thunderstorms, freezing anything, heavy rain or snow. */
function isSevere(code: number): boolean {
  return code >= 95 || code === 65 || code === 75 || code === 82 || code === 86 || code === 67;
}

