import { getTodaysEvents } from "@/lib/calendar";

/**
 * "Hey Miles, week ahead" — the shape of the coming week, glanced at once
 * rather than read day by day.
 *
 * `getTodaysEvents` reads purely off the date it's passed — nothing in it
 * touches the actual wall clock — so fetching "today plus N days" is just
 * calling it with a later date, seven times, in parallel. No calendar-layer
 * changes needed.
 */

export type WeekDay = {
  weekday: string;
  date: string;
  count: number;
  density: "light" | "moderate" | "busy";
  firstEvent: string | null;
};

const DAYS = 7;

export async function gatherWeek(now: Date, days: number = DAYS): Promise<WeekDay[]> {
  const dates = Array.from({ length: days }, (_, i) => new Date(now.getTime() + i * 24 * 60 * 60_000));
  const perDay = await Promise.all(dates.map((date) => getTodaysEvents(date)));

  return dates.map((date, i) => {
    const events = [...perDay[i]].sort((a, b) => a.start.localeCompare(b.start));
    return {
      weekday: date.toLocaleDateString("en-US", { weekday: "long" }),
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      count: events.length,
      density: events.length === 0 ? "light" : events.length <= 3 ? "moderate" : "busy",
      firstEvent: events[0]?.title ?? null,
    };
  });
}

/**
 * Deterministic on purpose — this is structured data (day names and counts),
 * not a judgement call, so it doesn't need a model or a key to be useful.
 */
export function composeWeek(days: WeekDay[]): string {
  if (days.length === 0) return "I don't have a calendar to look ahead in.";

  const busy = days.filter((d) => d.density === "busy").map((d) => d.weekday);
  const light = days.filter((d) => d.count === 0).map((d) => d.weekday);

  const lines: string[] = [];

  lines.push(
    "Here's the week ahead: " +
      days
        .map((d) => `${d.weekday} ${d.count === 0 ? "is clear" : `has ${d.count} ${d.count === 1 ? "event" : "events"}`}`)
        .join(", ") +
      ".",
  );

  if (busy.length) {
    lines.push(`${joinNames(busy)} ${busy.length === 1 ? "is" : "are"} your heaviest ${busy.length === 1 ? "day" : "days"}.`);
  }
  if (light.length) {
    lines.push(`${joinNames(light)} ${light.length === 1 ? "is" : "are"} wide open.`);
  }

  return lines.join(" ");
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}
