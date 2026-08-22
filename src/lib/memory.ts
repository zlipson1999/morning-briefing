import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type Memory = { id: string; text: string; createdAt: number };

const storePath = () => process.env.MEMORY_STORE || path.join(process.cwd(), ".data", "memory.json");

export async function readMemories(): Promise<Memory[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(/*turbopackIgnore: true*/ storePath(), "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is Memory =>
      item && typeof item.id === "string" && typeof item.text === "string" && typeof item.createdAt === "number",
    ).slice(-100);
  } catch {
    return [];
  }
}

async function writeMemories(memories: Memory[]) {
  const target = storePath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(memories, null, 2), "utf8");
  await fs.rename(temp, target);
}

export async function remember(text: string) {
  const clean = text.trim().replace(/\s+/g, " ").slice(0, 500);
  if (!clean) throw new Error("There is nothing to remember.");
  const memories = await readMemories();
  const existing = memories.find((memory) => memory.text.toLowerCase() === clean.toLowerCase());
  if (existing) return existing;
  const memory = { id: randomUUID(), text: clean, createdAt: Date.now() };
  await writeMemories([...memories, memory].slice(-100));
  return memory;
}

export async function forget(query: string) {
  const clean = query.trim().toLowerCase();
  if (!clean) throw new Error("Say what Miles should forget.");
  const memories = await readMemories();
  const matches = memories.filter((memory) =>
    memory.id === query || memory.text.toLowerCase().includes(clean),
  );
  if (matches.length !== 1) {
    throw new Error(matches.length === 0 ? "No matching memory was found." : "More than one memory matches; be more specific.");
  }
  await writeMemories(memories.filter((memory) => memory.id !== matches[0].id));
  return matches[0];
}

