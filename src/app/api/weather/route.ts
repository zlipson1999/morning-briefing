import { describeError, fail, ok } from "@/lib/panel";
import { getWeather, type Weather } from "@/lib/providers/weather";
import { HOME_LOCATION } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const latitude = Number(params.get("lat") ?? HOME_LOCATION.latitude);
  const longitude = Number(params.get("lon") ?? HOME_LOCATION.longitude);
  const label = params.get("label") ?? HOME_LOCATION.label;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return fail("Those coordinates don't look right.", { retryable: false, status: 400 });
  }

  try {
    const { value, stale } = await getWeather(latitude, longitude, label);
    return ok<Weather>({ data: value, stale });
  } catch (error) {
    console.error("[weather]", error);
    return fail(describeError(error, "The weather service"));
  }
}
