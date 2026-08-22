"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the full morning briefing has already played today.
 *
 * The first open of the day gets the boot sequence and the whole briefing.
 * Every open after that gets the short "what now" update instead — by 3pm you
 * know what today looks like, and replaying it is noise.
 *
 * Stored per browser rather than on the server: the answer is "have *I* heard
 * it", and this app has no idea who is asking.
 */

const KEY = "mb:briefed";
const NOW_KEY = "mb:now";
const EVENING_KEY = "mb:evening-briefed";
const historyListeners = new Set<() => void>();

function emitHistoryChange(): void {
  for (const listener of historyListeners) listener();
}

/**
 * Keep the once-daily state live in the current tab and in other open tabs.
 * `storage` only fires in the *other* document, so the explicit emit in the
 * marker functions below is what updates the tab that actually played audio.
 */
export function subscribeBriefingHistory(onChange: () => void): () => void {
  historyListeners.add(onChange);

  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === EVENING_KEY) emitHistoryChange();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);

  return () => {
    historyListeners.delete(onChange);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

export function hasBriefedToday(): boolean {
  try {
    return localStorage.getItem(KEY) === today();
  } catch {
    // Private mode: every open is the first one. Better than never briefing.
    return false;
  }
}

/** Called once the morning briefing has actually started speaking. */
export function markBriefedToday(): void {
  try {
    localStorage.setItem(KEY, today());
  } catch {
    /* private mode — the preference just won't persist */
  }
  emitHistoryChange();
}

export function hasEveningBriefedToday(): boolean {
  try {
    return localStorage.getItem(EVENING_KEY) === today();
  } catch {
    return false;
  }
}

export function markEveningBriefedToday(): void {
  try {
    localStorage.setItem(EVENING_KEY, today());
  } catch {
    /* private mode — the wind-down may replay on the next open */
  }
  emitHistoryChange();
}

export type AutomaticBriefingMode = "morning" | "now" | "evening";

/** The once-per-open decision, kept pure so the day-boundary rules stay testable. */
export function automaticBriefingMode({
  hour,
  morningPlayed,
  eveningPlayed,
}: {
  hour: number;
  morningPlayed: boolean;
  eveningPlayed: boolean;
}): AutomaticBriefingMode {
  if (hour >= 20) return eveningPlayed ? "now" : "evening";
  return morningPlayed ? "now" : "morning";
}

/**
 * What the last "what now" update said, and when.
 *
 * Fed back to the server on the next update so it can skip anything that
 * hasn't changed. Time-scoped to today: yesterday's facts are not facts.
 */
export type NowMemory = { at: number; keys: string[] };

/** Bounded, because this goes into a query string. */
const MAX_KEYS = 20;
const MAX_KEY_CHARS = 1500;

export function readNowMemory(): NowMemory | null {
  try {
    const raw = localStorage.getItem(NOW_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as NowMemory & { day?: string };
    if (parsed?.day !== today() || !Array.isArray(parsed.keys)) return null;

    return { at: Number(parsed.at) || 0, keys: parsed.keys.filter((k) => typeof k === "string") };
  } catch {
    return null;
  }
}

export function writeNowMemory(keys: string[]): void {
  try {
    const previous = readNowMemory();
    // Newest last, deduped, then trimmed from the front.
    const merged = [...new Set([...(previous?.keys ?? []), ...keys])].slice(-MAX_KEYS);

    let trimmed = merged;
    while (trimmed.join(",").length > MAX_KEY_CHARS && trimmed.length > 1) {
      trimmed = trimmed.slice(1);
    }

    localStorage.setItem(NOW_KEY, JSON.stringify({ day: today(), at: Date.now(), keys: trimmed }));
  } catch {
    /* private mode — every update is the first one */
  }
}

/**
 * Read as external state rather than copied into React state in an effect,
 * so the server and the first client render agree and nothing flashes.
 *
 * The server assumes the briefing has already played: a repeat open is the
 * common case, and it means the boot overlay never renders for a frame
 * before being taken away again.
 */
export function useBriefedToday(): boolean {
  return useSyncExternalStore(subscribeBriefingHistory, hasBriefedToday, () => true);
}

/** Hydration-safe clock check used only to decide whether to show the morning boot. */
export function useIsEvening(): boolean {
  return useSyncExternalStore(() => () => {}, () => new Date().getHours() >= 20, () => false);
}
