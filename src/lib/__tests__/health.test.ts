import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCache } from "@/lib/cache";

let dir: string;

async function load() {
  vi.resetModules();
  return import("@/lib/health");
}

beforeEach(async () => {
  clearCache();
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "mb-health-"));
  for (const name of ["CALENDAR_STORE", "TASKS_STORE", "MAIL_STORE"]) {
    vi.stubEnv(name, path.join(dir, `${name}.json`));
  }
  for (const name of [
    "ANTHROPIC_API_KEY",
    "CALENDAR_INGEST_TOKEN",
    "SESSION_SECRET",
    "ETRADE_CONSUMER_KEY",
    "ETRADE_CONSUMER_SECRET",
    "PIPER_BIN",
    "PIPER_VOICE",
    "ELEVENLABS_API_KEY",
  ]) {
    vi.stubEnv(name, "");
  }
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
  clearCache();
  await fs.rm(dir, { recursive: true, force: true });
});

function stubEverythingHealthy() {
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
    const url = String(input);
    if (url.includes("open-meteo")) {
      return new Response(JSON.stringify({ current: { temperature_2m: 84 } }), { status: 200 });
    }
    if (url.includes("nominatim")) {
      return new Response(JSON.stringify({ address: { town: "Lantana" } }), { status: 200 });
    }
    if (url.includes("osrm")) {
      return new Response(JSON.stringify({ routes: [{ duration: 600 }] }), { status: 200 });
    }
    if (url.includes("/api/tags")) {
      return new Response(JSON.stringify({ models: [{ name: "gemma4:e2b" }] }), { status: 200 });
    }
    if (url.includes("finance.yahoo")) {
      return new Response(
        JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: 512.4 } }] } }),
        { status: 200 },
      );
    }
    return new Response("<rss><channel><item><title>x</title></item></channel></rss>", { status: 200 });
  }));
}

const find = (checks: Awaited<ReturnType<Awaited<ReturnType<typeof load>>["runHealthChecks"]>>, name: string) =>
  checks.find((check) => check.name.includes(name));

describe("runHealthChecks", () => {
  it("reports every upstream as ok when they all answer", async () => {
    stubEverythingHealthy();
    const { runHealthChecks } = await load();
    const checks = await runHealthChecks();

    expect(find(checks, "Open-Meteo")?.status).toBe("ok");
    expect(find(checks, "OSRM")?.status).toBe("ok");
    expect(find(checks, "Nominatim")?.status).toBe("ok");
    expect(find(checks, "Yahoo")?.status).toBe("ok");
    expect(checks.some((check) => check.group === "News" && check.status === "ok")).toBe(true);
  });

  /**
   * The failure this page exists for: a feed whose URL moved still answers
   * 200, and the panel just goes quiet.
   */
  it("calls a 200 with no items a failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<rss><channel></channel></rss>", { status: 200 })));
    const { runHealthChecks } = await load();
    const news = (await runHealthChecks()).filter((check) => check.group === "News");

    expect(news.every((check) => check.status === "failing")).toBe(true);
    expect(news[0].detail).toMatch(/no items/);
  });

  it("reports the actual error when an upstream is down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 503 })));
    const { runHealthChecks } = await load();

    expect(find(await runHealthChecks(), "Open-Meteo")?.detail).toBe("HTTP 503");
  });

  it("distinguishes off from failing for optional configuration", async () => {
    stubEverythingHealthy();
    const { runHealthChecks } = await load();
    const checks = await runHealthChecks();

    expect(find(checks, "Claude")?.status).toBe("off");
    expect(find(checks, "Ingest token")?.status).toBe("off");
    expect(find(checks, "Server voice")?.status).toBe("off");
    expect(find(checks, "E*TRADE")?.status).toBe("off");
    expect(checks.every((check) => check.status !== "failing")).toBe(true);
  });

  it("says a store is empty rather than broken", async () => {
    stubEverythingHealthy();
    const { runHealthChecks } = await load();

    expect(find(await runHealthChecks(), "Calendar")?.status).toBe("off");
    expect(find(await runHealthChecks(), "Calendar")?.detail).toMatch(/sample data/);
  });

  it("fails a store whose last push was over a day ago", async () => {
    stubEverythingHealthy();
    const { runHealthChecks } = await load();
    const { upsertTasks } = await import("@/lib/tasks");

    await upsertTasks([
      { id: "t1", title: "x", dueIso: null, priority: "medium", project: "p", done: false, updatedAt: Date.now() },
    ]);

    // Rewrite the store's own timestamp to two days ago.
    const file = path.join(dir, "TASKS_STORE.json");
    const store = JSON.parse(await fs.readFile(file, "utf8"));
    store.updatedAt = Date.now() - 2 * 24 * 60 * 60_000;
    await fs.writeFile(file, JSON.stringify(store));

    const check = find(await runHealthChecks(), "Tasks");
    expect(check?.status).toBe("failing");
    expect(check?.detail).toMatch(/check the Zap/);
  });

  it("reports the configured chat model as ready when Ollama has pulled it", async () => {
    stubEverythingHealthy();
    const { runHealthChecks } = await load();
    const check = find(await runHealthChecks(), "Ollama");

    expect(check?.status).toBe("ok");
    expect(check?.detail).toMatch(/gemma4:e2b ready/);
  });

  /**
   * The quiet failure: Ollama is up, so the port answers, but the configured
   * model was never pulled and every question would 404.
   */
  it("fails a running Ollama that has never pulled the configured model", async () => {
    stubEverythingHealthy();
    vi.stubEnv("OLLAMA_MODEL", "llama9:70b");

    const { runHealthChecks } = await load();
    const check = find(await runHealthChecks(), "Ollama");

    expect(check?.status).toBe("failing");
    expect(check?.detail).toMatch(/has not been pulled/);
    expect(check?.detail).toMatch(/ollama pull llama9:70b/);
  });

  it("calls a missing Ollama off rather than failing — chat is optional", async () => {
    stubEverythingHealthy();
    // Nothing listening on the port: the connection is refused, not answered.
    const answering = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
      if (String(input).includes("/api/tags")) throw new TypeError("fetch failed");
      return answering(input, init);
    }));

    const { runHealthChecks } = await load();
    const check = find(await runHealthChecks(), "Ollama");

    expect(check?.status).toBe("off");
    expect(check?.detail).toMatch(/setup:local-llm/);
  });

  it("fails Piper when the binary isn't where it was told", async () => {
    stubEverythingHealthy();
    vi.stubEnv("PIPER_BIN", "/definitely/not/a/binary");
    vi.stubEnv("PIPER_VOICE", "/definitely/not/a/voice.onnx");

    const { runHealthChecks } = await load();
    const check = find(await runHealthChecks(), "Piper");

    expect(check?.status).toBe("failing");
    expect(check?.detail).toMatch(/binary not found/);
  });
});
