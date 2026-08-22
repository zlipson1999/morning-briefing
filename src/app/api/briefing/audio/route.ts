import { HOME_LOCATION } from "@/lib/config";
import { composeWithClaude, type BriefingMode } from "@/lib/briefing/claude";
import { composeEvening } from "@/lib/briefing/evening";
import { composeNow, nowKeys } from "@/lib/briefing/now";
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

  const snapshot = await gatherSnapshot({
    latitude: Number.isFinite(latitude) ? latitude : HOME_LOCATION.latitude,
    longitude: Number.isFinite(longitude) ? longitude : HOME_LOCATION.longitude,
    place: params.get("place") ?? HOME_LOCATION.label,
  });

  const requestedMode = params.get("mode");
  const mode: BriefingMode =
    requestedMode === "now" || requestedMode === "evening" ? requestedMode : "morning";

  // What the caller was told last time, so an update can skip what hasn't
  // changed rather than repeating itself twenty minutes later.
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

  const deterministic = mode === "now" ? composeNow(snapshot, context) : null;
  const text =
    written ??
    deterministic?.text ??
    (mode === "evening" ? composeEvening(snapshot) : composeTemplate(snapshot));
  const keys = mode === "now" ? (deterministic?.keys ?? nowKeys(snapshot, context)) : [];

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
      // Feed these back as ?said= on the next update.
      ...(keys.length ? { "X-Briefing-Keys": keys.join(",") } : {}),
      "X-Briefing-Voice": spoken.backend,
    },
  });
}
