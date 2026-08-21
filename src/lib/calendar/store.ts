import { createPushStore } from "@/lib/push/store";
import type { StoredEvent } from "./types";

/** Yesterday's events are already gone from the UI; don't keep them forever. */
const KEEP_MS = 2 * 24 * 60 * 60_000;

const store = createPushStore<StoredEvent>({
  name: "calendar",
  envVar: "CALENDAR_STORE",
  isExpired: (event) => {
    if (event.cancelled) return true;
    const end = Date.parse(event.endIso);
    return !Number.isNaN(end) && end < Date.now() - KEEP_MS;
  },
});

export async function readStore() {
  const { items, updatedAt } = await store.read();
  return { events: items, updatedAt };
}

export const upsertEvents = store.upsert;
export const removeEvent = store.remove;
export const clearStore = store.clear;
