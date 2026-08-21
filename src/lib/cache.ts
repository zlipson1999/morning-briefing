/**
 * Small TTL cache for server-side data fetching.
 *
 * Three jobs, all of which matter once panels poll on a timer:
 *   - keep upstream request volume flat no matter how many tabs are open;
 *   - collapse concurrent misses for the same key into one upstream call;
 *   - serve a stale value when a refresh fails, so one bad upstream response
 *     doesn't blank a panel that was working a minute ago.
 */

type Entry<T> = { value: T; freshUntil: number; staleUntil: number };

const store = new Map<string, Entry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

export type CacheOptions = {
  /** How long the value is served without revalidating. */
  ttlMs: number;
  /** How much longer it may be served if a refresh throws. Defaults to 6x ttl. */
  graceMs?: number;
};

export async function cached<T>(
  key: string,
  options: CacheOptions,
  load: () => Promise<T>,
): Promise<{ value: T; stale: boolean }> {
  const now = Date.now();
  const grace = options.graceMs ?? options.ttlMs * 6;
  const hit = store.get(key) as Entry<T> | undefined;

  if (hit && now < hit.freshUntil) {
    return { value: hit.value, stale: false };
  }

  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) {
    return { value: await existing, stale: false };
  }

  const pending = load()
    .then((value) => {
      store.set(key, {
        value,
        freshUntil: Date.now() + options.ttlMs,
        staleUntil: Date.now() + options.ttlMs + grace,
      });
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, pending);

  try {
    return { value: await pending, stale: false };
  } catch (error) {
    // Refresh failed. A recent-enough previous value beats an empty panel.
    if (hit && now < hit.staleUntil) {
      return { value: hit.value, stale: true };
    }
    throw error;
  }
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
