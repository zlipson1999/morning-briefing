import fs from "node:fs/promises";
import path from "node:path";
import { WATCHLIST, type Holding } from "@/lib/config";

const storePath = () => process.env.WATCHLIST_STORE || path.join(process.cwd(), ".data", "watchlist.json");

export async function readWatchlist(): Promise<Holding[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(/*turbopackIgnore: true*/ storePath(), "utf8"));
    if (!Array.isArray(parsed)) return [...WATCHLIST];
    return parsed.filter((item): item is Holding => item && typeof item.symbol === "string");
  } catch {
    return [...WATCHLIST];
  }
}

export async function updateWatchlist(symbol: string, operation: "add" | "remove") {
  const normalized = symbol.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 12);
  if (!normalized) throw new Error("A valid ticker symbol is required.");
  const current = await readWatchlist();
  const next = operation === "add"
    ? current.some((item) => item.symbol.toUpperCase() === normalized)
      ? current
      : [...current, { symbol: normalized, speak: true }]
    : current.filter((item) => item.symbol.toUpperCase() !== normalized);
  const target = storePath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(next, null, 2), "utf8");
  await fs.rename(temp, target);
  return next;
}

