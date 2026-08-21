import fs from "node:fs/promises";
import { fetchWithTimeout } from "@/lib/cache";
import { HOME_LOCATION, WATCHLIST } from "@/lib/config";
import { GLOBAL_FEEDS, googleNewsFeedFor, localFeedsFor } from "@/lib/feeds";
import { readStore } from "@/lib/calendar";
import { readTaskStore } from "@/lib/tasks";
import { readMailStore } from "@/lib/mail";
import { configuredBackend } from "@/lib/tts";
import { claudeIsConfigured } from "@/lib/briefing/claude";
import { credentials } from "@/lib/providers/etrade/client";
import { ingestIsEnabled } from "@/lib/push/auth";
import { sealingIsDurable } from "@/lib/providers/etrade/seal";

/**
 * Does any of this actually work?
 *
 * Every upstream here fails safe — a dead feed drops its headlines, a dead
 * router hides the leave-by banner, a missing key falls back to the
 * deterministic briefing. That is the right behaviour and it has one nasty
 * consequence: a half-broken install looks exactly like a working one, and
 * "why is Near Me empty" becomes an investigation.
 *
 * This turns it into a glance. Nothing here is called on the dashboard path.
 */

export type CheckStatus = "ok" | "failing" | "off";

export type Check = {
  name: string;
  group: "News" | "Weather" | "Commute" | "Money" | "Voice" | "Pushed in" | "Config";
  status: CheckStatus;
  detail: string;
  /** Round-trip time in ms, for the checks that make a request. */
  ms?: number;
};

async function timed(name: string, group: Check["group"], probe: () => Promise<string>): Promise<Check> {
  const started = Date.now();
  try {
    return { name, group, status: "ok", detail: await probe(), ms: Date.now() - started };
  } catch (error) {
    return {
      name,
      group,
      status: "failing",
      detail: error instanceof Error ? error.message : String(error),
      ms: Date.now() - started,
    };
  }
}

const off = (name: string, group: Check["group"], detail: string): Check => ({
  name,
  group,
  status: "off",
  detail,
});

async function expectOk(url: string, headers: Record<string, string> = {}, timeoutMs = 8000) {
  const res = await fetchWithTimeout(url, { timeoutMs, headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

const FEED_HEADERS = {
  "User-Agent": "morning-briefing/1.0 (personal dashboard)",
  Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
};

/** A feed that answers 200 with no items is broken in the way that matters. */
async function checkFeed(url: string): Promise<string> {
  const xml = await (await expectOk(url, FEED_HEADERS, 7000)).text();
  const items = (xml.match(/<item[\s>]/g)?.length ?? 0) + (xml.match(/<entry[\s>]/g)?.length ?? 0);
  if (items === 0) throw new Error("200, but no items — the feed URL has probably moved");
  return `${items} items`;
}

export async function runHealthChecks(): Promise<Check[]> {
  const place = HOME_LOCATION.label;
  const localFeeds = localFeedsFor(place);
  const firstSymbol = WATCHLIST[0]?.symbol ?? "SPY";

  const checks = await Promise.all([
    ...GLOBAL_FEEDS.map((feed) => timed(feed.name, "News", () => checkFeed(feed.url))),

    ...(localFeeds.length
      ? localFeeds.map((feed) => timed(feed.name, "News", () => checkFeed(feed.url)))
      : [
          timed(`${place} (Google News)`, "News", () =>
            checkFeed(googleNewsFeedFor(place).url),
          ),
        ]),

    timed("Open-Meteo", "Weather", async () => {
      const body = await (
        await expectOk(
          "https://api.open-meteo.com/v1/forecast" +
            `?latitude=${HOME_LOCATION.latitude}&longitude=${HOME_LOCATION.longitude}` +
            "&current=temperature_2m&temperature_unit=fahrenheit&forecast_days=1",
        )
      ).json();
      const temp = body?.current?.temperature_2m;
      if (temp === undefined) throw new Error("200, but no forecast in the body");
      return `${Math.round(temp)}°F at home`;
    }),

    timed("Nominatim (geocoding)", "Commute", async () => {
      const body = await (
        await expectOk(
          "https://nominatim.openstreetmap.org/reverse?format=json&zoom=12" +
            `&lat=${HOME_LOCATION.latitude}&lon=${HOME_LOCATION.longitude}`,
          { "User-Agent": "morning-briefing/1.0 (personal dashboard)" },
          6000,
        )
      ).json();
      const address = body?.address ?? {};
      const city = address.city ?? address.town ?? address.village ?? address.county;
      if (!city) throw new Error("200, but no locality — 'Near me' will use the configured city");
      return `home resolves to ${city}`;
    }),

    timed("OSRM (routing)", "Commute", async () => {
      const body = await (
        await expectOk(
          "https://router.project-osrm.org/route/v1/driving/" +
            `${HOME_LOCATION.longitude},${HOME_LOCATION.latitude};` +
            `${HOME_LOCATION.longitude + 0.1},${HOME_LOCATION.latitude + 0.1}` +
            "?overview=false",
          {},
          7000,
        )
      ).json();
      const seconds = body?.routes?.[0]?.duration;
      if (typeof seconds !== "number") throw new Error("200, but no route — leave-by will stay hidden");
      return "routing a test trip";
    }),

    timed(`Yahoo quotes (${firstSymbol})`, "Money", async () => {
      const body = await (
        await expectOk(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(firstSymbol)}` +
            "?range=1d&interval=1d",
          { "User-Agent": "Mozilla/5.0 (compatible; morning-briefing/1.0)", Accept: "application/json" },
          7000,
        )
      ).json();
      const price = body?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (typeof price !== "number") throw new Error("200, but no price in the body");
      return `${firstSymbol} at ${price}`;
    }),

    checkStores(),
    checkVoice(),
    checkConfig(),
  ]);

  return checks.flat();
}

async function checkStores(): Promise<Check[]> {
  const describe = async (
    name: string,
    read: () => Promise<{ items?: Record<string, unknown>; events?: Record<string, unknown>; updatedAt: number }>,
  ): Promise<Check> => {
    try {
      const store = await read();
      const items = store.items ?? store.events ?? {};
      const count = Object.keys(items).length;

      if (count === 0) {
        return off(name, "Pushed in", "nothing pushed yet — the panel is showing sample data");
      }

      const age = Date.now() - store.updatedAt;
      const hours = Math.floor(age / 3_600_000);

      return {
        name,
        group: "Pushed in",
        status: hours >= 24 ? "failing" : "ok",
        detail:
          hours >= 24
            ? `${count} records, but last push was ${Math.floor(hours / 24)} days ago — check the Zap`
            : `${count} records, last push ${hours < 1 ? "under an hour" : `${hours} hours`} ago`,
      };
    } catch (error) {
      return { name, group: "Pushed in", status: "failing", detail: String(error) };
    }
  };

  return Promise.all([
    describe("Calendar", readStore),
    describe("Tasks", readTaskStore),
    describe("Mail", readMailStore),
  ]);
}

async function checkVoice(): Promise<Check[]> {
  const backend = configuredBackend();

  if (backend === "piper") {
    const bin = process.env.PIPER_BIN!;
    const voice = process.env.PIPER_VOICE!;
    const reachable = async (path: string, what: string) => {
      try {
        await fs.access(path);
        return null;
      } catch {
        return `${what} not found at ${path}`;
      }
    };

    const problem = (await reachable(bin, "binary")) ?? (await reachable(voice, "voice model"));
    return [
      problem
        ? { name: "Piper", group: "Voice", status: "failing", detail: problem }
        : { name: "Piper", group: "Voice", status: "ok", detail: "binary and voice model present" },
    ];
  }

  if (backend === "elevenlabs") {
    return [
      await timed("ElevenLabs", "Voice", async () => {
        await expectOk(
          "https://api.elevenlabs.io/v1/voices",
          { "xi-api-key": process.env.ELEVENLABS_API_KEY! },
          8000,
        );
        return "key accepted";
      }),
    ];
  }

  return [
    off("Server voice", "Voice", "not configured — the browser's own engine will read the briefing"),
  ];
}

function checkConfig(): Check[] {
  const etrade = credentials();

  return [
    claudeIsConfigured()
      ? { name: "Claude", group: "Config", status: "ok", detail: "ANTHROPIC_API_KEY set — briefing written, local news ranked" }
      : off("Claude", "Config", "no key — deterministic briefing, news ordered by recency"),

    ingestIsEnabled()
      ? { name: "Ingest token", group: "Config", status: "ok", detail: "set — Zapier can push" }
      : off("Ingest token", "Config", "CALENDAR_INGEST_TOKEN unset — every ingest route refuses"),

    sealingIsDurable()
      ? { name: "Session sealing", group: "Config", status: "ok", detail: "SESSION_SECRET set — E*TRADE survives a restart" }
      : off("Session sealing", "Config", "no SESSION_SECRET — an E*TRADE connection dies with the process"),

    etrade
      ? { name: "E*TRADE", group: "Money", status: "ok", detail: `key configured (${etrade.mode})` }
      : off("E*TRADE", "Money", "no key — the portfolio panel runs on Yahoo quotes"),
  ];
}
