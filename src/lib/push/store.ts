import fs from "node:fs/promises";
import path from "node:path";

/**
 * A small keyed JSON store on disk, for the things Zapier pushes in.
 *
 * Pushed data has to survive a restart, and this app has no database and
 * shouldn't grow one for a few dozen rows a day. A JSON file on the machine
 * you already run the app on is the honest size of the problem.
 *
 * Writes are serialised through one promise chain and land via a temp file
 * plus rename, so a Zap firing three events at once can't interleave them or
 * leave a half-written file behind.
 */

export type PushRecord = { id: string; updatedAt: number };

export type PushStore<T> = { items: Record<string, T>; updatedAt: number };

export type PushStoreHandle<T extends PushRecord> = {
  read: () => Promise<PushStore<T>>;
  upsert: (incoming: T[]) => Promise<number>;
  remove: (id: string) => Promise<boolean>;
  clear: () => Promise<void>;
};

let queue: Promise<unknown> = Promise.resolve();

/** Runs every write one at a time, across all stores, whatever the order. */
function serialise<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  queue = next.catch(() => {});
  return next;
}

export function createPushStore<T extends PushRecord>(options: {
  /** File name under .data, and the label in errors. */
  name: string;
  /** Env var that overrides the path. Read per call, so tests can set it. */
  envVar: string;
  /** Records this returns true for are dropped on the next write. */
  isExpired: (record: T) => boolean;
}): PushStoreHandle<T> {
  const empty: PushStore<T> = { items: {}, updatedAt: 0 };

  const storePath = () =>
    process.env[options.envVar] || path.join(process.cwd(), ".data", `${options.name}.json`);

  async function read(): Promise<PushStore<T>> {
    try {
      const parsed = JSON.parse(await fs.readFile(/*turbopackIgnore: true*/ storePath(), "utf8")) as PushStore<T>;
      if (!parsed || typeof parsed !== "object" || !parsed.items) return empty;
      return parsed;
    } catch {
      // No file yet, or an unreadable one. Either way there's nothing pushed.
      return empty;
    }
  }

  async function write(store: PushStore<T>): Promise<void> {
    const target = storePath();
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(temp, JSON.stringify(store, null, 2), "utf8");
    await fs.rename(temp, target);
  }

  const prune = (items: Record<string, T>): Record<string, T> =>
    Object.fromEntries(Object.entries(items).filter(([, record]) => !options.isExpired(record)));

  return {
    read,

    upsert: (incoming) =>
      serialise(async () => {
        const store = await read();
        const items = { ...store.items };
        for (const record of incoming) items[record.id] = record;

        const next: PushStore<T> = { items: prune(items), updatedAt: Date.now() };
        await write(next);
        return Object.keys(next.items).length;
      }),

    remove: (id) =>
      serialise(async () => {
        const store = await read();
        if (!store.items[id]) return false;

        const items = { ...store.items };
        delete items[id];
        await write({ items: prune(items), updatedAt: Date.now() });
        return true;
      }),

    clear: () =>
      serialise(async () => {
        await write({ items: {}, updatedAt: Date.now() });
      }),
  };
}
