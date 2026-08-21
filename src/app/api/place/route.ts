import { HOME_LOCATION } from "@/lib/config";
import { reverseGeocode } from "@/lib/providers/weather";

export const dynamic = "force-dynamic";

/**
 * Coordinates in, place name out.
 *
 * The browser knows where you are but not what that place is called, and the
 * news panel is keyed by name — so without this, granting geolocation moved
 * the weather and left "Near me" pointed at the configured home city forever.
 *
 * Reverse geocoding runs server-side so Nominatim sees one identified client
 * rather than one per tab, which is what its usage policy asks for.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const latitude = Number(params.get("lat"));
  const longitude = Number(params.get("lon"));

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return Response.json({ error: "Those coordinates don't look right." }, { status: 400 });
  }

  const label = await reverseGeocode(latitude, longitude, HOME_LOCATION.label);
  return Response.json({ label }, { headers: { "Cache-Control": "no-store" } });
}
