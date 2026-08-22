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

/**
 * Which memories are worth spending context on.
 *
 * Every stored fact used to be pasted into the system prompt. At a hundred
 * short facts that is most of a 4K window, and the snapshot Miles actually
 * needs to answer with — today's calendar, inbox and weather — is what gets
 * pushed out. So the question chooses: anything it mentions comes first, and
 * whatever budget is left is filled with the most recently learned facts, so a
 * new memory is usable in the very next breath even when nothing matches.
 */
const MEMORY_LIMIT = 12;
const MEMORY_BUDGET_CHARS = 900;

// Ordinary conversational filler carries no signal about which fact is wanted.
const STOPWORDS = new Set([
  "about", "after", "again", "all", "and", "any", "anything", "are", "ask", "before", "but", "can",
  "did", "does", "doing", "everything", "for", "from", "get", "going", "had", "has", "have", "her",
  "here", "him", "his", "how", "its", "just", "know", "like", "me", "mine", "much", "my", "need",
  "not", "now", "our", "out", "over", "please", "put", "said", "say", "should", "some", "tell",
  "than", "that", "the", "their", "them", "then", "there", "these", "they", "thing", "things",
  "this", "those", "time", "today", "told", "too", "use", "very", "want", "was", "were", "what",
  "when", "where", "which", "who", "why", "will", "with", "would", "you", "your",
]);

/** Content words, loosely stemmed so "dentists" still finds "dentist". */
function keywords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .map((word) => word.replace(/'s$/, "").replace(/(?<=.{3})s$/, ""))
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word));
  return new Set(words);
}

export function selectMemories(memories: Memory[], question: string): Memory[] {
  const wanted = keywords(question);
  const scored = memories.map((memory) => ({
    memory,
    score: [...keywords(memory.text)].filter((word) => wanted.has(word)).length,
  }));
  const newestFirst = (a: { memory: Memory }, b: { memory: Memory }) => b.memory.createdAt - a.memory.createdAt;
  const ordered = [
    ...scored.filter((item) => item.score > 0).sort((a, b) => b.score - a.score || newestFirst(a, b)),
    ...scored.filter((item) => item.score === 0).sort(newestFirst),
  ];

  const chosen: Memory[] = [];
  let spent = 0;
  for (const { memory } of ordered) {
    if (chosen.length >= MEMORY_LIMIT) break;
    if (spent + memory.text.length > MEMORY_BUDGET_CHARS) continue;
    chosen.push(memory);
    spent += memory.text.length;
  }
  // Hand them over in the order they were learned: a history, not a ranking.
  return chosen.sort((a, b) => a.createdAt - b.createdAt);
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

