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
}

/**
 * Read as external state rather than copied into React state in an effect,
 * so the server and the first client render agree and nothing flashes.
 *
 * The server assumes the briefing has already played: a repeat open is the
 * common case, and it means the boot overlay never renders for a frame
 * before being taken away again.
 */
const subscribe = () => () => {};

export function useBriefedToday(): boolean {
  return useSyncExternalStore(subscribe, hasBriefedToday, () => true);
}
