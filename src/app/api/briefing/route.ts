import { HOME_LOCATION } from "@/lib/config";
import { claudeIsConfigured, composeWithClaude, type BriefingMode } from "@/lib/briefing/claude";
import { composeEvening } from "@/lib/briefing/evening";
import { composeNow, nowKeys } from "@/lib/briefing/now";
import { gatherSnapshot } from "@/lib/briefing/snapshot";
import { composeTemplate } from "@/lib/briefing/template";

export const dynamic = "force-dynamic";

/**
 * The whole briefing as one block of plain prose, meant to be spoken.
 *
 * This lives here rather than in any particular assistant so that anything —
 * a Piper TTS script, a cron job, a phone shortcut — can consume it over HTTP
 * without this app depending on that assistant, or vice versa.
 *
 *   curl -s localhost:3000/api/briefing | piper --model en_US-lessac-medium
 *
 * With ANTHROPIC_API_KEY set, Claude writes it: same data, but read across
 * rather than listed. Without one — or if that call fails — the deterministic
 * composer answers instead, so the endpoint has no failure mode where you get
 * nothing. `X-Briefing-Author` says which one you got.
 *
 * `?mode=now` returns the short update the app plays on every open after the
 * first one today: the time, what's running or next, and only the mail and
 * tasks close enough to the clock to matter. The morning briefing already
 * covered the day, so this one doesn't.
 * `?mode=evening` returns the once-daily wind-down and tomorrow's first event.
 *
 * `?format=json` returns the underlying snapshot instead of prose, for
 * anything that would rather render the data than hear it.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const latitude = Number(params.get("lat") ?? HOME_LOCATION.latitude);
  const longitude = Number(params.get("lon") ?? HOME_LOCATION.longitude);
  const place = params.get("place") ?? HOME_LOCATION.label;

  const snapshot = await gatherSnapshot({
    latitude: Number.isFinite(latitude) ? latitude : HOME_LOCATION.latitude,
    longitude: Number.isFinite(longitude) ? longitude : HOME_LOCATION.longitude,
    place,
  });

  if (params.get("format") === "json") {
    return Response.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  }

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

  return new Response(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Briefing-Author": written ? "claude" : claudeIsConfigured() ? "template-fallback" : "template",
      "X-Briefing-Mode": mode,
      // Feed these back as ?said= on the next update.
      ...(keys.length ? { "X-Briefing-Keys": keys.join(",") } : {}),
    },
  });
}
