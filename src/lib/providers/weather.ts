import { cached, fetchWithTimeout } from "@/lib/cache";

export type Weather = {
  place: string;
  tempF: number;
  feelsLikeF: number;
  highF: number;
  lowF: number;
  condition: string;
  code: number;
  precipChance: number;
  windMph: number;
  sunrise: string;
  sunset: string;
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

/**
 * Open-Meteo needs no API key and no account, which is why it's the default
 * here — one less credential to manage for a panel that just shows a number.
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
      "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m" +
      "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset" +
      "&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=1";

    const res = await fetchWithTimeout(url, { timeoutMs: 8000 });
    if (!res.ok) throw new Error(`Open-Meteo responded ${res.status}`);
    const body = await res.json();

    const current = body?.current;
    const daily = body?.daily;
    if (!current || !daily) throw new Error("Open-Meteo returned no forecast");

    return {
      place: await resolvePlace(latitude, longitude, fallbackPlace),
      tempF: Math.round(current.temperature_2m),
      feelsLikeF: Math.round(current.apparent_temperature),
      highF: Math.round(daily.temperature_2m_max?.[0]),
      lowF: Math.round(daily.temperature_2m_min?.[0]),
      condition: describeCode(current.weather_code),
      code: current.weather_code,
      precipChance: daily.precipitation_probability_max?.[0] ?? 0,
      windMph: Math.round(current.wind_speed_10m),
      sunrise: daily.sunrise?.[0] ?? "",
      sunset: daily.sunset?.[0] ?? "",
    } satisfies Weather;
  });
}

/**
 * Turn coordinates into a place name via OpenStreetMap's Nominatim (no key).
 * Cached hard and long: the name for a given rounded coordinate never changes,
 * and Nominatim's usage policy asks for exactly this kind of restraint.
 */
async function resolvePlace(
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
          "https://nominatim.openstreetmap.org/reverse?format=json&zoom=10" +
            `&lat=${latitude}&lon=${longitude}`,
          {
            timeoutMs: 5000,
            headers: { "User-Agent": "morning-briefing/1.0 (personal dashboard)" },
          },
        );
        if (!res.ok) throw new Error(`Nominatim responded ${res.status}`);
        const body = await res.json();
        const a = body?.address ?? {};
        const city = a.city ?? a.town ?? a.village ?? a.county;
        const region = a.state ?? a.country;
        if (!city) throw new Error("Nominatim returned no locality");
        return region ? `${city}, ${region}` : city;
      },
    );
    return value;
  } catch {
    // A missing place name must never cost us the forecast.
    return fallback;
  }
}
