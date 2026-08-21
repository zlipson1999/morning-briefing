import fs from "node:fs/promises";
import path from "node:path";
import type { CalendarStore, StoredEvent } from "./types";

/**
 * The calendar, on disk.
 *
 * Zapier pushes Google Calendar events here; they have to survive a restart,
 * and this app has no database and shouldn't grow one for a few dozen rows a
 * day. A JSON file on the machine you already run the app on is the honest
 * size of the problem.
 *
 * Writes are serialised through one promise chain and land via a temp file
 * plus rename, so a Zap firing three events at once can't interleave them or
 * leave a half-written file behind.
 */

const STORE_PATH = process.env.CALENDAR_STORE ?? path.join(process.cwd(), ".data", "calendar.json");

const EMPTY: CalendarStore = { events: {}, updatedAt: 0 };

/** Yesterday's events are already gone from the UI; don't keep them forever. */
const KEEP_MS = 2 * 24 * 60 * 60_000;

let queue: Promise<unknown> = Promise.resolve();

/** Runs writes one at a time, whatever order the requests arrive in. */
function serialise<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  queue = next.catch(() => {});
  return next;
}

export async function readStore(): Promise<CalendarStore> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as CalendarStore;
    if (!parsed || typeof parsed !== "object" || !parsed.events) return EMPTY;
    return parsed;
  } catch {
    // No file yet, or an unreadable one. Either way there's no calendar.
    return EMPTY;
  }
}

async function writeStore(store: CalendarStore): Promise<void> {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  const temp = `${STORE_PATH}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(store, null, 2), "utf8");
  await fs.rename(temp, STORE_PATH);
}

function prune(events: Record<string, StoredEvent>): Record<string, StoredEvent> {
  const cutoff = Date.now() - KEEP_MS;
  return Object.fromEntries(
    Object.entries(events).filter(([, event]) => {
      if (event.cancelled) return false;
      const end = Date.parse(event.endIso);
      return Number.isNaN(end) || end >= cutoff;
    }),
  );
}

/** Upserts by id and returns how many events the store holds afterwards. */
export function upsertEvents(incoming: StoredEvent[]): Promise<number> {
  return serialise(async () => {
    const store = await readStore();
    const events = { ...store.events };

    for (const event of incoming) {
      if (event.cancelled) delete events[event.id];
      else events[event.id] = event;
    }

    const next: CalendarStore = { events: prune(events), updatedAt: Date.now() };
    await writeStore(next);
    return Object.keys(next.events).length;
  });
}

export function removeEvent(id: string): Promise<boolean> {
  return serialise(async () => {
    const store = await readStore();
    if (!store.events[id]) return false;

    const events = { ...store.events };
    delete events[id];
    await writeStore({ events: prune(events), updatedAt: Date.now() });
    return true;
  });
}

export function clearStore(): Promise<void> {
  return serialise(async () => {
    await writeStore({ events: {}, updatedAt: Date.now() });
  });
}
