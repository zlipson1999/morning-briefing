import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCache } from "@/lib/cache";
import { clockLabel, compassPoint, describeUv, getWeather } from "@/lib/providers/weather";

/** A trimmed but structurally faithful Open-Meteo response. */
function forecast() {
  return {
    current: {
      time: "2026-08-21T09:00",
      temperature_2m: 84.3,
      relative_humidity_2m: 71,
      apparent_temperature: 93.8,
      is_day: 1,
      precipitation: 0,
      weather_code: 95,
      wind_speed_10m: 11.4,
      wind_direction_10m: 112,
      wind_gusts_10m: 24.6,
    },
    hourly: {
      time: Array.from({ length: 24 }, (_, i) => `2026-08-21T${String(i).padStart(2, "0")}:00`),
      temperature_2m: Array.from({ length: 24 }, (_, i) => 70 + i),
      precipitation_probability: Array.from({ length: 24 }, (_, i) => i * 2),
      weather_code: Array.from({ length: 24 }, () => 3),
    },
    daily: {
      weather_code: [95],
      temperature_2m_max: [91.2],
      temperature_2m_min: [77.6],
      sunrise: ["2026-08-21T06:57"],
      sunset: ["2026-08-21T19:52"],
      uv_index_max: [9.4],
      precipitation_sum: [0.42],
      precipitation_probability_max: [65],
    },
  };
}

let call = 0;

beforeEach(() => {
  call = 0;
  clearCache();
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
    call += 1;
    const url = String(input);
    if (url.includes("nominatim")) {
      return new Response(
        JSON.stringify({ address: { town: "Lantana", state: "Florida" } }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify(forecast()), { status: 200 });
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearCache();
});

describe("helpers", () => {
  it("names compass points from degrees", () => {
    expect(compassPoint(0)).toBe("N");
    expect(compassPoint(112)).toBe("ESE");
    expect(compassPoint(350)).toBe("N");
    expect(compassPoint(-90)).toBe("W");
    expect(compassPoint(NaN)).toBe("—");
  });

  it("bands UV the way the WHO does", () => {
    expect(describeUv(1)).toBe("Low");
    expect(describeUv(5.9)).toBe("Moderate");
    expect(describeUv(7)).toBe("High");
    expect(describeUv(11)).toBe("Extreme");
  });

  /**
   * Open-Meteo returns local wall-clock strings. Re-parsing them through Date
   * would shift sunrise by the server's offset, which is how a briefing ends
   * up announcing a 3am sunrise.
   */
  it("reads clock labels off the string, not through Date", () => {
    expect(clockLabel("2026-08-21T06:57")).toBe("6:57 AM");
    expect(clockLabel("2026-08-21T19:52")).toBe("7:52 PM");
    expect(clockLabel("2026-08-21T00:05")).toBe("12:05 AM");
    expect(clockLabel(undefined)).toBe("");
  });
});

describe("getWeather", () => {
  it("maps every field the panel and the briefing read", async () => {
    const { value } = await getWeather(26.586, -80.052, "Nowhere");

    expect(value).toMatchObject({
      place: "Lantana, Florida",
      tempF: 84,
      feelsLikeF: 94,
      highF: 91,
      lowF: 78,
      condition: "Thunderstorms",
      isDay: true,
      humidity: 71,
      precipChance: 65,
      precipTotalIn: 0.42,
      windMph: 11,
      gustMph: 25,
      windFrom: "ESE",
      uvIndexMax: 9.4,
      sunrise: "6:57 AM",
      sunset: "7:52 PM",
    });
  });

  it("reports daylight as minutes between sunrise and sunset", async () => {
    const { value } = await getWeather(26.1, -80.1, "Nowhere");
    expect(value.daylightMinutes).toBe(12 * 60 + 55);
  });

  it("starts the hourly window at the current hour", async () => {
    const { value } = await getWeather(26.2, -80.2, "Nowhere");

    expect(value.hourly).toHaveLength(12);
    expect(value.hourly[0]).toEqual({ label: "9 AM", tempF: 79, precipChance: 18, code: 3 });
    expect(value.hourly.at(-1)?.label).toBe("8 PM");
  });

  it("keeps the forecast when the place name can't be resolved", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) =>
      String(input).includes("nominatim")
        ? new Response("nope", { status: 500 })
        : new Response(JSON.stringify(forecast()), { status: 200 }),
    ));

    const { value } = await getWeather(26.3, -80.3, "Lantana, Florida");
    expect(value.place).toBe("Lantana, Florida");
    expect(value.tempF).toBe(84);
  });

  it("fails loudly when the forecast body is missing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));
    await expect(getWeather(26.4, -80.4, "Nowhere")).rejects.toThrow(/no forecast/);
  });

  it("only asks upstream once per coordinate", async () => {
    await getWeather(26.5, -80.5, "Nowhere");
    const after = call;
    await getWeather(26.5, -80.5, "Nowhere");
    expect(call).toBe(after);
  });
});
