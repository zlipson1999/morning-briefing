import { cached, fetchWithTimeout } from "@/lib/cache";

export type HourPoint = {
  /** Local hour label, e.g. "7 AM". */
  label: string;
  tempF: number;
  precipChance: number;
  code: number;
};

export type Weather = {
  place: string;
  tempF: number;
  feelsLikeF: number;
  highF: number;
  lowF: number;
  condition: string;
  code: number;
  isDay: boolean;
  humidity: number;
  precipChance: number;
  /** Rain/snow already fallen today, in inches. */
  precipTotalIn: number;
  windMph: number;
  gustMph: number;
  /** Compass point, e.g. "ESE". */
  windFrom: string;
  uvIndexMax: number;
  /** Local clock labels, e.g. "6:47 AM". */
  sunrise: string;
  sunset: string;
  /** Minutes of daylight, so the UI can say how long the day is. */
  daylightMinutes: number;
  /** The next twelve hours, for the strip in the detail card. */
  hourly: HourPoint[];
};

/** WMO 4677 weather codes, as returned by Open-Meteo. */
const CONDITIONS: Record<number, string> = {
  0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Freezing fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
  56: "Freezing drizzle", 57: "Freezing drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain",
  66: "Freezing rain", 67: "Freezing rain",
  71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
  80: "Light showers", 81: "Showers", 82: "Heavy showers",
  85: "Snow showers", 86: "Heavy snow showers",
  95: "Thunderstorms", 96: "Thunderstorms with hail", 99: "Severe thunderstorms",
};

export function describeCode(code: number): string {
  return CONDITIONS[code] ?? "Unsettled";
}

const POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"] as const;

export function compassPoint(degrees: number): string {
  if (!Number.isFinite(degrees)) return "—";
  return POINTS[Math.round(((degrees % 360) + 360) % 360 / 22.5) % 16];
}

/** UV is only meaningful as a word. These are the WHO bands. */
export function describeUv(index: number): string {
  if (index < 3) return "Low";
  if (index < 6) return "Moderate";
  if (index < 8) return "High";
  if (index < 11) return "Very high";
  return "Extreme";
}

/**
 * Open-Meteo returns local wall-clock ISO strings ("2026-08-21T06:47") when
 * asked for `timezone=auto`. Read the clock straight off the string rather
 * than through Date, which would re-interpret it in the server's zone.
 */
export function clockLabel(localIso: string | undefined): string {
  const match = /T(\d{2}):(\d{2})/.exec(localIso ?? "");
  if (!match) return "";
  const hours = Number(match[1]);
  const suffix = hours < 12 ? "AM" : "PM";
  return `${hours % 12 === 0 ? 12 : hours % 12}:${match[2]} ${suffix}`;
}

function hourLabel(localIso: string): string {
  const hours = Number(/T(\d{2})/.exec(localIso)?.[1] ?? NaN);
  if (!Number.isFinite(hours)) return "";
  return `${hours % 12 === 0 ? 12 : hours % 12} ${hours < 12 ? "AM" : "PM"}`;
}

function minutesBetween(startIso: string | undefined, endIso: string | undefined): number {
  const at = (iso: string | undefined) => {
    const match = /T(\d{2}):(\d{2})/.exec(iso ?? "");
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const start = at(startIso);
  const end = at(endIso);
  return start === null || end === null ? 0 : Math.max(0, end - start);
}

const round = (value: unknown): number => {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Open-Meteo needs no API key and no account, which is why it's the default
 * here — one less credential to manage for a panel that just shows a number.
 *
 * Everything the API offers for free is pulled in one request: the panel and
 * the spoken briefing both read from this, so anything missing here is
 * something the briefing can't tell you.
 */
export async function getWeather(
  latitude: number,
  longitude: number,
  fallbackPlace: string,
): Promise<{ value: Weather; stale: boolean }> {
  const key = `weather:${latitude},${longitude}`;

  return cached(key, { ttlMs: 15 * 60_000 }, async () => {
    const url =
      "https://api.open-meteo.com/v1/forecast" +
      `?latitude=${latitude}&longitude=${longitude}` +
      "&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day," +
      "precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m" +
      "&hourly=temperature_2m,precipitation_probability,weather_code" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset," +
      "uv_index_max,precipitation_sum,precipitation_probability_max" +
      "&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch" +
      "&timezone=auto&forecast_days=2";

    const res = await fetchWithTimeout(url, { timeoutMs: 8000 });
    if (!res.ok) throw new Error(`Open-Meteo responded ${res.status}`);
    const body = await res.json();

    const current = body?.current;
    const daily = body?.daily;
    if (!current || !daily) throw new Error("Open-Meteo returned no forecast");

    return {
      place: await reverseGeocode(latitude, longitude, fallbackPlace),
      tempF: round(current.temperature_2m),
      feelsLikeF: round(current.apparent_temperature),
      highF: round(daily.temperature_2m_max?.[0]),
      lowF: round(daily.temperature_2m_min?.[0]),
      condition: describeCode(current.weather_code),
      code: Number(current.weather_code) || 0,
      isDay: current.is_day !== 0,
      humidity: round(current.relative_humidity_2m),
      precipChance: round(daily.precipitation_probability_max?.[0]),
      precipTotalIn: Number(daily.precipitation_sum?.[0]) || 0,
      windMph: round(current.wind_speed_10m),
      gustMph: round(current.wind_gusts_10m),
      windFrom: compassPoint(Number(current.wind_direction_10m)),
      uvIndexMax: Number(daily.uv_index_max?.[0]) || 0,
      sunrise: clockLabel(daily.sunrise?.[0]),
      sunset: clockLabel(daily.sunset?.[0]),
      daylightMinutes: minutesBetween(daily.sunrise?.[0], daily.sunset?.[0]),
      hourly: nextTwelveHours(body, current.time),
    } satisfies Weather;
  });
}

/**
 * Two forecast days are requested so this window doesn't run out at 9pm.
 * `current.time` and `hourly.time` are both local wall-clock, so the current
 * hour is found by string prefix rather than by re-parsing into a Date.
 */
function nextTwelveHours(body: Record<string, unknown>, currentTime: string): HourPoint[] {
  const hourly = (body?.hourly ?? {}) as Record<string, unknown[]>;
  const times = (hourly.time ?? []) as string[];
  if (times.length === 0) return [];

  const prefix = String(currentTime ?? "").slice(0, 13);
  const start = Math.max(0, times.findIndex((time) => time.slice(0, 13) === prefix));

  return times.slice(start, start + 12).map((time, offset) => ({
    label: hourLabel(time),
    tempF: round((hourly.temperature_2m as number[])?.[start + offset]),
    precipChance: round((hourly.precipitation_probability as number[])?.[start + offset]),
    code: Number((hourly.weather_code as number[])?.[start + offset]) || 0,
  }));
}

/**
 * Turn coordinates into a place name via OpenStreetMap's Nominatim (no key).
 * Cached hard and long: the name for a given rounded coordinate never changes,
 * and Nominatim's usage policy asks for exactly this kind of restraint.
 *
 * Exported because the news panel needs the same answer — "near me" has to
 * follow you, not the configured home city.
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
  fallback: string,
): Promise<string> {
  try {
    const { value } = await cached(
      `place:${latitude},${longitude}`,
      { ttlMs: 24 * 60 * 60_000 },
      async () => {
        const res = await fetchWithTimeout(
          "https://nominatim.openstreetmap.org/reverse?format=json&zoom=12" +
            `&lat=${latitude}&lon=${longitude}`,
          {
            timeoutMs: 5000,
            headers: { "User-Agent": "morning-briefing/1.0 (personal dashboard)" },
          },
        );
        if (!res.ok) throw new Error(`Nominatim responded ${res.status}`);
        const body = await res.json();
        const a = body?.address ?? {};
        const city = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.suburb ?? a.county;
        const region = a.state ?? a.country;
        if (!city) throw new Error("Nominatim returned no locality");
        return region ? `${city}, ${region}` : String(city);
      },
    );
    return value;
  } catch {
    // A missing place name must never cost us the forecast.
    return fallback;
  }
}
