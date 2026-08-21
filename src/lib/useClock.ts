"use client";

import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let snapshot: number | null = null;
let timer: ReturnType<typeof setInterval> | undefined;

function tick() {
  const next = Date.now();
  // Only wake subscribers when the displayed minute actually rolls over.
  if (snapshot !== null && Math.floor(next / 60_000) === Math.floor(snapshot / 60_000)) {
    return;
  }
  snapshot = next;
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  if (timer === undefined) {
    snapshot = Date.now();
    timer = setInterval(tick, 15_000);
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

const getSnapshot = () => snapshot;
const getServerSnapshot = () => null;

/**
 * Wall-clock time in epoch ms, or `null` while rendering on the server and on
 * the very first client render. Reading it this way keeps the markup identical
 * on both sides, so the date and time always come from the viewer's timezone
 * without a hydration mismatch.
 */
export function useClock(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
