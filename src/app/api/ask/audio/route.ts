import { HOME_LOCATION } from "@/lib/config";
import { composeAnswer } from "@/lib/briefing/ask";
import { gatherSnapshot } from "@/lib/briefing/snapshot";
import { configuredBackend, speakBriefing } from "@/lib/tts";

export const dynamic = "force-dynamic";

/** The answer to one question, spoken — mirrors /api/briefing/audio. */
export async function GET(request: Request) {
  if (configuredBackend() === "none") {
    return Response.json(
      { error: { message: "No speech backend configured.", retryable: false } },
      { status: 501, headers: { "Cache-Control": "no-store" } },
    );
  }

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
  const spoken = await speakBriefing(text);
  if (!spoken) {
    return Response.json(
      { error: { message: "Speech synthesis failed.", retryable: true } },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }

  return new Response(new Uint8Array(spoken.audio), {
    headers: {
      "Content-Type": spoken.contentType,
      "Content-Length": String(spoken.audio.byteLength),
      "Cache-Control": "no-store",
      "X-Briefing-Voice": spoken.backend,
    },
  });
}
