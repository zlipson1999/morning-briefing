import { HOME_LOCATION } from "@/lib/config";
import { composeWithClaude } from "@/lib/briefing/claude";
import { briefingMode } from "@/lib/briefing/mode";
import { composeEvening } from "@/lib/briefing/evening";
import { composeNow } from "@/lib/briefing/now";
import { gatherSnapshot } from "@/lib/briefing/snapshot";
import { composeTemplate } from "@/lib/briefing/template";
import { configuredBackend, speakBriefing } from "@/lib/tts";

export const dynamic = "force-dynamic";

/**
 * The briefing as audio, in one good voice on every device.
 *
 * Returns 501 when no speech backend is configured, which the client treats
 * as "use the browser engine" rather than as a failure — the app still speaks
 * with nothing set up at all.
 *
 *   curl -s localhost:3000/api/briefing/audio -o brief.wav
 *
 * Same three modes as /api/briefing — see that route for what each means.
 */
export async function GET(request: Request) {
  if (configuredBackend() === "none") {
    return Response.json(
      { error: { message: "No speech backend configured.", retryable: false } },
      { status: 501, headers: { "Cache-Control": "no-store" } },
    );
  }

  const params = new URL(request.url).searchParams;
  const latitude = Number(params.get("lat") ?? HOME_LOCATION.latitude);
  const longitude = Number(params.get("lon") ?? HOME_LOCATION.longitude);

  const mode = briefingMode(params.get("mode"));

  const snapshot = await gatherSnapshot({
    latitude: Number.isFinite(latitude) ? latitude : HOME_LOCATION.latitude,
    longitude: Number.isFinite(longitude) ? longitude : HOME_LOCATION.longitude,
    place: params.get("place") ?? HOME_LOCATION.label,
    includeTomorrow: mode === "evening",
  });

  const since = Number(params.get("since"));
  const context =
    mode === "now"
      ? {
          since: Number.isFinite(since) && since > 0 ? since : null,
          said: (params.get("said") ?? "").split(",").filter(Boolean),
        }
      : {};

  const written =
    params.get("author") === "template" ? null : await composeWithClaude(snapshot, mode, context);

  let text: string;
  let keys: string[] = [];

  if (written) {
    text = written;
  } else if (mode === "now") {
    const deterministic = composeNow(snapshot, context);
    text = deterministic.text;
    keys = deterministic.keys;
  } else if (mode === "evening") {
    text = composeEvening(snapshot);
  } else {
    text = composeTemplate(snapshot);
  }

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
      // The text is cached upstream; caching the audio in the browser too
      // would just mean a stale briefing after the data moves.
      "Cache-Control": "no-store",
      "X-Briefing-Author": written ? "claude" : "template",
      "X-Briefing-Mode": mode,
      ...(keys.length ? { "X-Briefing-Keys": keys.join(",") } : {}),
      "X-Briefing-Voice": spoken.backend,
    },
  });
}
