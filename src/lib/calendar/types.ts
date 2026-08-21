import type { CalendarEvent } from "@/lib/data";

/**
 * An event as it's kept on disk: full ISO timestamps, because the store
 * outlives the day and "09:00" doesn't say which one.
 */
export type StoredEvent = {
  id: string;
  title: string;
  startIso: string;
  endIso: string;
  location: string;
  /** Present only when the location is somewhere you have to drive to. */
  address?: string;
  attendees: string[];
  kind: CalendarEvent["kind"];
  allDay: boolean;
  cancelled: boolean;
  updatedAt: number;
};

export type CalendarStore = {
  events: Record<string, StoredEvent>;
  updatedAt: number;
};
