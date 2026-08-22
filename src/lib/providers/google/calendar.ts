import { cached } from "@/lib/cache";
import { addressFrom, kindFrom } from "@/lib/calendar/normalize";
import type { CalendarEvent } from "@/lib/data";
import { googleGet, googleIsConnected, googleRequest } from "./auth";

/**
 * Today's events, straight from the Google Calendar API.
 *
 * `singleEvents=true` expands recurring events into their instances — without
 * it a weekly standup shows as one event on the day it was created in 2019.
 */

type ApiEvent = {
  id?: string;
  summary?: string;
  location?: string;
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { displayName?: string; email?: string; self?: boolean; resource?: boolean }[];
};

function hhmm(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  // An all-day event has a bare date and no clock; treat it as spanning the day.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return fallback;
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

export function mapGoogleEvent(entry: ApiEvent): CalendarEvent | null {
  if (!entry?.summary || entry.status === "cancelled") return null;

  const start = entry.start?.dateTime ?? entry.start?.date;
  if (!start) return null;

  const attendees = (entry.attendees ?? [])
    .filter((person) => !person.self && !person.resource)
    .map((person) => person.displayName || person.email || "")
    .filter(Boolean)
    .slice(0, 12);

  const location = entry.location ?? (entry.start?.date ? "All day" : "");

  return {
    id: entry.id ?? `${entry.summary}:${start}`,
    title: entry.summary,
    start: hhmm(start, "00:00"),
    end: hhmm(entry.end?.dateTime ?? entry.end?.date, "23:59"),
    location,
    address: addressFrom(entry.location ?? ""),
    attendees,
    kind: kindFrom(entry.summary, location, attendees),
  };
}

export async function googleCalendarToday(now: Date): Promise<CalendarEvent[] | null> {
  if (!(await googleIsConnected())) return null;

  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);

  const { value } = await cached(
    `google:calendar:${dayStart.toDateString()}`,
    { ttlMs: 3 * 60_000 },
    async () => {
      const body = await googleGet(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events" +
          `?timeMin=${encodeURIComponent(dayStart.toISOString())}` +
          `&timeMax=${encodeURIComponent(dayEnd.toISOString())}` +
          "&singleEvents=true&orderBy=startTime&maxResults=50",
      );
      if (!body) throw new Error("Google Calendar: not connected");

      return ((body.items as ApiEvent[]) ?? [])
        .map(mapGoogleEvent)
        .filter((event): event is CalendarEvent => event !== null);
    },
  );
  return value;
}

export async function createGoogleCalendarEvent(input: {
  title: string;
  start: string;
  end: string;
  location?: string;
}) {
  const start = new Date(input.start);
  const end = new Date(input.end);
  if (!input.title.trim() || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    throw new Error("The event needs a title and valid start/end times.");
  }
  return googleRequest(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    "POST",
    {
      summary: input.title.trim().slice(0, 200),
      location: input.location?.trim().slice(0, 300) || undefined,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    },
  );
}

