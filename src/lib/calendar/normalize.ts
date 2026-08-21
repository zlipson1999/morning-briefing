import type { CalendarEvent } from "@/lib/data";
import type { StoredEvent } from "./types";

/**
 * Turns whatever Zapier sends into a `StoredEvent`.
 *
 * Zapier's Google Calendar trigger is not one shape: fields arrive nested
 * (`start.dateTime`), flattened (`start__dateTime`), or renamed by whoever
 * built the Zap. Rather than demand one, this accepts the shapes that
 * actually turn up and rejects only what it genuinely can't read — an event
 * with no title or no start time.
 */

type Payload = Record<string, unknown>;

/** Reads a key by any of its aliases, nested or `__`-flattened. */
function field(payload: Payload, ...names: string[]): unknown {
  for (const name of names) {
    if (payload[name] !== undefined && payload[name] !== null) return payload[name];

    const flattened = payload[name.replace(".", "__")];
    if (flattened !== undefined && flattened !== null) return flattened;

    const [head, tail] = name.split(".");
    if (tail) {
      const parent = payload[head];
      if (parent && typeof parent === "object") {
        const value = (parent as Payload)[tail];
        if (value !== undefined && value !== null) return value;
      }
    }
  }
  return undefined;
}

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/**
 * Google sends `dateTime` for timed events and a bare `date` for all-day
 * ones. A bare date is midnight local, which is what `T00:00:00` gives us.
 */
function timestamp(value: unknown): { iso: string; allDay: boolean } | null {
  const raw = text(value);
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = new Date(`${raw}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : { iso: parsed.toISOString(), allDay: true };
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : { iso: parsed.toISOString(), allDay: false };
}

function attendeesOf(value: unknown): string[] {
  const entries = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,;]/) : [];

  return entries
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      if (entry && typeof entry === "object") {
        const person = entry as Payload;
        return text(person.displayName) || text(person.name) || text(person.email);
      }
      return "";
    })
    .filter(Boolean)
    .slice(0, 12);
}

const STREET = /\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|hwy|highway|pkwy|parkway|ct|court|ter|terrace|pl|place|suite|ste)\b/i;

/**
 * Whether a location is somewhere you drive to, or just a name for a room.
 *
 * This is what makes a leave-by time possible, so it errs toward silence: a
 * Zoom link, "Conf Rm 4B" and "TBD" all produce no address, and the banner
 * shows nothing rather than routing you to a guess.
 */
export function addressFrom(location: string): string | undefined {
  const value = location.trim();
  if (!value || value.length < 8) return undefined;
  if (/^https?:\/\//i.test(value)) return undefined;
  if (/\b(zoom|meet\.google|teams|webex|hangout|phone|call|tbd|online|remote|virtual)\b/i.test(value)) {
    return undefined;
  }
  // A real address carries a number and either a comma or a street word.
  if (!/\d/.test(value)) return undefined;
  if (!value.includes(",") && !STREET.test(value)) return undefined;
  return value;
}

export function kindFrom(title: string, location: string, attendees: string[]): CalendarEvent["kind"] {
  if (/\binterview\b/i.test(title)) return "interview";
  if (/\b(lunch|dinner|breakfast|coffee|drinks|birthday|doctor|dentist|gym|school pickup)\b/i.test(title)) {
    return "personal";
  }
  if (attendees.length === 0 && (!location || /\b(blocked|focus|deep work|hold)\b/i.test(`${title} ${location}`))) {
    return "focus";
  }
  return "meeting";
}

/** One incoming object, or `null` if it isn't a usable event. */
export function normalizeEvent(payload: Payload): StoredEvent | null {
  const title = text(field(payload, "title", "summary", "name", "event_title", "subject"));
  const start = timestamp(field(payload, "start.dateTime", "start.date", "start", "startTime", "start_time", "begin"));
  if (!title || !start) return null;

  const end =
    timestamp(field(payload, "end.dateTime", "end.date", "end", "endTime", "end_time", "finish")) ??
    // No end time is common on quick-add events. An hour is Google's own default.
    { iso: new Date(new Date(start.iso).getTime() + 60 * 60_000).toISOString(), allDay: start.allDay };

  const location = text(field(payload, "location", "where", "place"));
  const attendees = attendeesOf(field(payload, "attendees", "attendee_emails", "guests", "participants"));

  const id =
    text(field(payload, "id", "event_id", "iCalUID", "ical_uid", "uid")) ||
    // No id means we can't dedupe on identity, so dedupe on content instead —
    // a re-sent event overwrites itself rather than doubling up.
    `${title}:${start.iso}`;

  const status = text(field(payload, "status", "event_status")).toLowerCase();

  return {
    id,
    title,
    startIso: start.iso,
    endIso: end.iso,
    location,
    address: addressFrom(location),
    attendees,
    kind: kindFrom(title, location, attendees),
    allDay: start.allDay,
    cancelled: status === "cancelled" || status === "canceled",
    updatedAt: Date.now(),
  };
}

/** A single event, `{events:[...]}`, or a bare array — Zaps send all three. */
export function normalizePayload(body: unknown): StoredEvent[] {
  const candidates: unknown[] = Array.isArray(body)
    ? body
    : body && typeof body === "object" && Array.isArray((body as Payload).events)
      ? ((body as Payload).events as unknown[])
      : body && typeof body === "object"
        ? [body]
        : [];

  return candidates
    .filter((entry): entry is Payload => Boolean(entry) && typeof entry === "object")
    .map(normalizeEvent)
    .filter((event): event is StoredEvent => event !== null);
}
