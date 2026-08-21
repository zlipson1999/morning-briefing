"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * A set of ids that survives a reload, scoped to today.
 *
 * Ticking a task and having it come back on refresh isn't a missing feature,
 * it's the dashboard reporting a number it can't back up. This is the smallest
 * honest fix: the browser remembers what you did, and forgets it tomorrow when
 * the day's list resets anyway.
 *
 * localStorage is external state, so it's read through useSyncExternalStore
 * rather than copied into React state in an effect. That keeps the server and
 * first client render identical (both see an empty set) and syncs across tabs.
 */

const EMPTY = "[]";

type Store = { raw: string; listeners: Set<() => void> };

const stores = new Map<string, Store>();

/** Local calendar day, so the reset lands at your midnight, not UTC's. */
function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

function storageKey(name: string): string {
  return `mb:${name}:${today()}`;
}

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? EMPTY;
  } catch {
    return EMPTY;
  }
}

function storeFor(key: string): Store {
  let store = stores.get(key);
  if (!store) {
    store = { raw: EMPTY, listeners: new Set() };
    stores.set(key, store);
  }
  return store;
}

/** Yesterday's ticks are noise. Drop every day but today's on first use. */
function pruneOtherDays(name: string, keep: string) {
  try {
    const prefix = `mb:${name}:`;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix) && key !== keep) localStorage.removeItem(key);
    }
  } catch {
    /* private mode — nothing to prune */
  }
}

function subscribe(key: string, name: string, onChange: () => void) {
  const store = storeFor(key);
  const first = store.listeners.size === 0;
  store.listeners.add(onChange);

  if (first) {
    pruneOtherDays(name, key);
    store.raw = read(key);
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== key) return;
    store.raw = read(key);
    for (const listener of store.listeners) listener();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    store.listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function write(key: string, ids: string[]) {
  const raw = JSON.stringify(ids);
  const store = storeFor(key);
  store.raw = raw;
  try {
    localStorage.setItem(key, raw);
  } catch {
    /* private mode — the toggle still works, it just won't outlive the tab */
  }
  for (const listener of store.listeners) listener();
}

function parse(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export type DailySet = {
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  size: number;
};

export function useDailySet(name: string): DailySet {
  const key = storageKey(name);

  const raw = useSyncExternalStore(
    useCallback((onChange: () => void) => subscribe(key, name, onChange), [key, name]),
    () => storeFor(key).raw,
    () => EMPTY,
  );

  const ids = useMemo(() => new Set(parse(raw)), [raw]);

  const toggle = useCallback(
    (id: string) => {
      const next = new Set(parse(storeFor(key).raw));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      write(key, [...next]);
    },
    [key],
  );

  // Memoised so consumers can safely use it as a dependency.
  return useMemo(
    () => ({ has: (id: string) => ids.has(id), toggle, size: ids.size }),
    [ids, toggle],
  );
}
