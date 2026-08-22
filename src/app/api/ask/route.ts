import { HOME_LOCATION } from "@/lib/config";
import { composeAnswer } from "@/lib/briefing/ask";
import { gatherSnapshot } from "@/lib/briefing/snapshot";

export const dynamic = "force-dynamic";

/**
 * Answers one question about the day, grounded in the same snapshot every
 * other composer reads.
 *
 *   curl -s "localhost:3000/api/ask?q=how's+NVDA+doing"
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const question = params.get("q") ?? "";

  const latitude = Number(params.get("lat") ?? HOME_LOCATION.latitude);
  const longitude = Number(params.get("lon") ?? HOME_LOCATION.longitude);

  const snapshot = await gatherSnapshot({
    latitude: Number.isFinite(latitude) ? latitude : HOME_LOCATION.latitude,
    longitude: Number.isFinite(longitude) ? longitude : HOME_LOCATION.longitude,
    place: params.get("place") ?? HOME_LOCATION.label,
  });

  const text = await composeAnswer(snapshot, question);

  return new Response(text, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
