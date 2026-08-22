/**
 * Small TTL cache for server-side data fetching.
 *
 * Four jobs, all of which matter once panels poll on a timer:
 *   - keep upstream request volume flat no matter how many tabs are open;
 *   - collapse concurrent misses for the same key into one upstream call;
 *   - serve a stale value when a refresh fails, so one bad upstream response
 *     doesn't blank a panel that was working a minute ago — and serve it to
 *     *every* caller waiting on that refresh, not just the one that started it;
 *   - stay bounded, since cache keys come partly from user-supplied places.
 */

type Entry<T> = { value: T; freshUntil: number; staleUntil: number };

const store = new Map<string, Entry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

/** Plenty for one person's places; enough of a ceiling to bound memory. */
const MAX_ENTRIES = 256;

export type CacheOptions = {
  /** How long the value is served without revalidating. */
  ttlMs: number;
  /** How much longer it may be served if a refresh throws. Defaults to 6x ttl. */
  graceMs?: number;
};

function remember<T>(key: string, value: T, ttlMs: number, graceMs: number) {
  const now = Date.now();
  store.set(key, { value, freshUntil: now + ttlMs, staleUntil: now + ttlMs + graceMs });

  if (store.size <= MAX_ENTRIES) return;
  // Drop anything past its grace window first; if that isn't enough, evict
  // oldest-inserted (Map iterates in insertion order).
  for (const [k, entry] of store) {
    if (store.size <= MAX_ENTRIES) break;
    if (now >= (entry as Entry<unknown>).staleUntil) store.delete(k);
  }
  for (const k of store.keys()) {
    if (store.size <= MAX_ENTRIES) break;
    if (k !== key) store.delete(k);
  }
}

export async function cached<T>(
  key: string,
  options: CacheOptions,
  load: () => Promise<T>,
): Promise<{ value: T; stale: boolean }> {
  const grace = options.graceMs ?? options.ttlMs * 6;
  const hit = store.get(key) as Entry<T> | undefined;

  if (hit && Date.now() < hit.freshUntil) {
    return { value: hit.value, stale: false };
  }

  let pending = inFlight.get(key) as Promise<T> | undefined;
  if (!pending) {
    pending = load()
      .then((value) => {
        remember(key, value, options.ttlMs, grace);
        return value;
      })
      .finally(() => {
        inFlight.delete(key);
      });
    inFlight.set(key, pending);
  }

  try {
    return { value: await pending, stale: false };
  } catch (error) {
    // The refresh failed. A recent-enough previous value beats an empty panel
    // — and this path is shared by every caller that joined the same refresh,
    // not only the one that started it.
    const fallback = (store.get(key) as Entry<T> | undefined) ?? hit;
    if (fallback && Date.now() < fallback.staleUntil) {
      return { value: fallback.value, stale: true };
    }
    throw error;
  }
}

/** Test seam: forget everything, so cases can't leak values into each other. */
export function clearCache() {
  store.clear();
  inFlight.clear();
}

/** Fetch with a hard timeout — an upstream that hangs must not hang the panel. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 8000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}
