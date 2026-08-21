import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fetchWithTimeout } from "@/lib/cache";

/**
 * Server-side speech for the briefing.
 *
 * The browser's own speech engine is free and offline, but its voice list is
 * different on every platform — and on iOS Safari, the half of the time you'd
 * actually use this, none of the preferred voices exist. One good voice
 * everywhere beats six inconsistent ones, so synthesis moved server-side.
 *
 * Two backends, both optional, checked in order:
 *
 *   1. Piper — a local binary. No key, no account, no network, no per-word
 *      cost. The natural fit for an app you run on your own machine and reach
 *      over Tailscale, which is what this one is.
 *   2. ElevenLabs — an HTTP call and an API key, for when you want the good
 *      voice more than you want the zero dependency.
 *
 * With neither configured this returns null and the client falls back to the
 * browser engine, so the briefing still speaks out of the box.
 */

export type Spoken = { audio: Buffer; contentType: string; backend: "piper" | "elevenlabs" };

export type TtsBackend = "piper" | "elevenlabs" | "none";

export function configuredBackend(): TtsBackend {
  if (process.env.PIPER_BIN && process.env.PIPER_VOICE) return "piper";
  if (process.env.ELEVENLABS_API_KEY) return "elevenlabs";
  return "none";
}

/**
 * One briefing per morning, re-requested on every reload and every tab. A
 * handful of entries keyed by the text itself is the whole working set — so
 * this is deliberately tiny and bounded by bytes rather than by count, since
 * the values are audio.
 */
const MAX_CACHE_BYTES = 24 * 1024 * 1024;
const audioCache = new Map<string, Spoken>();

function cacheBytes(): number {
  let total = 0;
  for (const entry of audioCache.values()) total += entry.audio.byteLength;
  return total;
}

function remember(key: string, spoken: Spoken) {
  audioCache.set(key, spoken);
  // Map iterates in insertion order, so the oldest entry is the first key.
  while (cacheBytes() > MAX_CACHE_BYTES && audioCache.size > 1) {
    const oldest = audioCache.keys().next().value;
    if (oldest === undefined) break;
    audioCache.delete(oldest);
  }
}

export function clearSpokenCache() {
  audioCache.clear();
}

export async function speakBriefing(text: string): Promise<Spoken | null> {
  const backend = configuredBackend();
  if (backend === "none") return null;

  const key = `${backend}:${crypto.createHash("sha256").update(text).digest("hex")}`;
  const hit = audioCache.get(key);
  if (hit) return hit;

  try {
    const spoken = backend === "piper" ? await withPiper(text) : await withElevenLabs(text);
    if (spoken) remember(key, spoken);
    return spoken;
  } catch (error) {
    // Never fatal: the client falls back to the browser engine.
    console.error(`[tts:${backend}]`, error);
    return null;
  }
}

/** How long synthesis may take before we give up and let the browser do it. */
const SYNTHESIS_TIMEOUT_MS = 30_000;

/**
 * Piper reads text on stdin and writes a WAV to stdout. Everything is passed
 * as arguments to a spawned process with no shell, so the briefing text
 * cannot become part of a command line.
 */
function withPiper(text: string): Promise<Spoken> {
  const bin = process.env.PIPER_BIN!;
  const voice = process.env.PIPER_VOICE!;

  return new Promise((resolve, reject) => {
    const child = spawn(bin, ["--model", voice, "--output_file", "-"], {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });

    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error("Piper took too long"));
    }, SYNTHESIS_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => errors.push(chunk));

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const audio = Buffer.concat(chunks);
      if (code !== 0 || audio.byteLength === 0) {
        reject(new Error(`Piper exited ${code}: ${Buffer.concat(errors).toString().slice(0, 300)}`));
        return;
      }
      resolve({ audio, contentType: "audio/wav", backend: "piper" });
    });

    child.stdin.end(text, "utf8");
  });
}

/** Default is a widely available neutral voice; override with ELEVENLABS_VOICE_ID. */
const ELEVENLABS_DEFAULT_VOICE = "JBFqnCBsd6RMkjVDRZzb";

async function withElevenLabs(text: string): Promise<Spoken> {
  const voice = process.env.ELEVENLABS_VOICE_ID || ELEVENLABS_DEFAULT_VOICE;

  const res = await fetchWithTimeout(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}`,
    {
      method: "POST",
      timeoutMs: SYNTHESIS_TIMEOUT_MS,
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY!,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: process.env.ELEVENLABS_MODEL_ID || "eleven_turbo_v2_5",
      }),
    },
  );

  if (!res.ok) throw new Error(`ElevenLabs responded ${res.status}`);

  const audio = Buffer.from(await res.arrayBuffer());
  if (audio.byteLength === 0) throw new Error("ElevenLabs returned no audio");

  return { audio, contentType: "audio/mpeg", backend: "elevenlabs" };
}
