import { events as sampleEvents, type CalendarEvent } from "@/lib/data";
import { googleCalendarToday } from "@/lib/providers/google/calendar";
import { googleCredentials, googleIsConnected } from "@/lib/providers/google/auth";
import { readStore } from "./store";
import type { StoredEvent } from "./types";

export * from "./types";
export { upsertEvents, removeEvent, clearStore, readStore } from "./store";
export { normalizePayload, normalizeEvent, addressFrom, kindFrom } from "./normalize";

/**
 * Today's calendar, best source first: polled straight from Google once
 * connected, else whatever Zapier has pushed, else the sample day.
 *
 * The fallbacks matter: a fresh clone with nothing configured still has a
 * working dashboard, and `source` says which one you're looking at so the UI
 * never quietly presents sample data as real.
 */

/** Local wall-clock minutes, in the timezone the app is running in. */
function minutesOf(iso: string): number {
  const at = new Date(iso);
  return at.getHours() * 60 + at.getMinutes();
}

function hhmm(iso: string): string {
  const at = new Date(iso);
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

function isToday(iso: string, today: Date): boolean {
  const at = new Date(iso);
  return (
    at.getFullYear() === today.getFullYear() &&
    at.getMonth() === today.getMonth() &&
    at.getDate() === today.getDate()
  );
}

function toCalendarEvent(event: StoredEvent): CalendarEvent {
  return {
    id: event.id,
    title: event.title,
    start: hhmm(event.startIso),
    end: hhmm(event.endIso),
    location: event.location || (event.allDay ? "All day" : ""),
    address: event.address,
    attendees: event.attendees,
    kind: event.kind,
  };
}

export type TodaysCalendar = {
  events: CalendarEvent[];
  source: "google" | "zapier" | "sample";
  /** For a push: when it last arrived. For a poll: just now. */
  syncedAt: number | null;
  /** Google creds exist but nobody has clicked Connect yet. */
  canConnectGoogle?: boolean;
};

export async function getTodaysCalendar(now: Date = new Date()): Promise<TodaysCalendar> {
  try {
    const google = await googleCalendarToday(now);
    if (google !== null) {
      return { events: google, source: "google", syncedAt: Date.now() };
    }
  } catch (error) {
    // Connected but unreachable: fall through to the pushed store or the
    // sample day — either is labelled, and labelled beats blank.
    console.error("[calendar] google:", error);
  }

  const canConnectGoogle = googleCredentials() !== null && !(await googleIsConnected());

  const store = await readStore();
  const stored = Object.values(store.events);

  if (stored.length === 0) {
    return { events: sampleEvents, source: "sample", syncedAt: null, canConnectGoogle };
  }

  const today = stored
    .filter((event) => !event.cancelled && isToday(event.startIso, now))
    .sort((a, b) => minutesOf(a.startIso) - minutesOf(b.startIso))
    .map(toCalendarEvent);

  return { events: today, source: "zapier", syncedAt: store.updatedAt || null, canConnectGoogle };
}

/** Convenience for the paths that only want the events themselves. */
export async function getTodaysEvents(now: Date = new Date()): Promise<CalendarEvent[]> {
  return (await getTodaysCalendar(now)).events;
}
