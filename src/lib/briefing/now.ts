import { endSentence } from "./prose";
import type { BriefingSnapshot } from "./snapshot";

/**
 * The short update you get on every open after the first one today.
 *
 * The full briefing is a morning thing: it tells you the shape of the whole
 * day. Replaying it at 3pm is noise — by then you know what today looks like
 * and you want one question answered, which is *what now*.
 *
 * So this is scoped to the moment rather than the day: the time, what's
 * running or next, and only the mail and tasks close enough to the clock to
 * be actionable. Everything the morning already covered — the weather, the
 * headlines, the shape of the day — is left out.
 */

/** How far ahead counts as "coming up" rather than "later today". */
const HORIZON_MINUTES = 180;

/** Mail older than this was part of the morning, not part of now. */
const RECENT_MAIL_MS = 3 * 60 * 60_000;

export function composeNow(snapshot: BriefingSnapshot): string {
  const lines: string[] = [];
  const { now, schedule, inbox, tasks, commute, weather } = snapshot;

  const live = schedule.events.find((event) => event.status === "now");
  const upcoming = schedule.events.filter((event) => event.status === "upcoming");
  const next = upcoming[0];

  // 1. Where you are in the day.
  lines.push(
    endSentence(`It's ${now.time}.` + (live ? ` You're in ${live.title} until ${live.end}` : "")),
  );

  // 2. The thing that needs you to move.
  if (commute && commute.leaveInMinutes <= HORIZON_MINUTES) {
    lines.push(
      commute.leaveInMinutes >= 0
        ? `Leave in ${commute.leaveInMinutes} minutes for ${commute.destination} — ` +
            `about a ${commute.driveMinutes} minute drive.`
        : `You're ${Math.abs(commute.leaveInMinutes)} minutes past when you should have left ` +
            `for ${commute.destination}.`,
    );
  }

  // 3. What's next.
  if (!next) {
    lines.push(
      live ? "Nothing after that." : "Nothing else on the calendar today.",
    );
  } else {
    const minutesAway = minutesUntil(next.start, now.minutes);
    lines.push(
      endSentence(
        minutesAway !== null && minutesAway <= HORIZON_MINUTES
          ? `Next is ${next.title} at ${next.start}, ${describeGap(minutesAway)}` +
            (next.location ? `, ${next.location}` : "")
          : `Nothing until ${next.title} at ${next.start}`,
      ),
    );
  }

  if (schedule.conflicts.length > 0) {
    lines.push(`${schedule.conflicts[0].a} still overlaps ${schedule.conflicts[0].b}.`);
  }

  // 4. Work that's due about now, rather than the whole list.
  const pressing = tasks.items.filter((task) => task.overdue || isDueSoon(task.due));
  if (pressing.length) {
    lines.push(
      pressing.length === 1
        ? `Still open: ${pressing[0].title}${pressing[0].overdue ? ", overdue" : ""}.`
        : `Still open: ${pressing[0].title}, and ${pressing.length - 1} other ` +
            `${pressing.length === 2 ? "thing" : "things"} due about now.`,
    );
  }

  // 5. Mail that arrived while you were away from this.
  const recent = inbox.messages.filter(
    (message) => message.important && isRecent(message.receivedAt),
  );
  if (recent.length) {
    lines.push(
      recent.length === 1
        ? `${recent[0].sender} needs you: ${recent[0].subject}.`
        : `${recent.length} flagged messages since you last looked, including ${recent[0].sender}.`,
    );
  }

  // 6. Weather only when it changes what you'd do in the next few hours.
  if (weather && (weather.precipChance >= 60 || isSevere(weather.code))) {
    lines.push(
      isSevere(weather.code)
        ? `${weather.condition} outside — worth knowing before you drive.`
        : `${weather.precipChance} percent chance of rain — take something.`,
    );
  }

  return lines.join("\n\n");
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

function isRecent(receivedAt: number | null | undefined): boolean {
  return typeof receivedAt === "number" && Date.now() - receivedAt <= RECENT_MAIL_MS;
}

/** Thunderstorms, freezing anything, heavy rain or snow. */
function isSevere(code: number): boolean {
  return code >= 95 || code === 65 || code === 75 || code === 82 || code === 86 || code === 67;
}
