import { HOME_LOCATION } from "@/lib/config";
import { claudeIsConfigured, composeWithClaude, type BriefingMode } from "@/lib/briefing/claude";
import { composeEvening } from "@/lib/briefing/evening";
import { composeNow } from "@/lib/briefing/now";
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
 * Three modes, via `?mode=`:
 * - `morning` (default): the full day, once.
 * - `now`: the short update every open after that — the time, what's running
 *   or next, and only the mail and tasks close enough to the clock to matter.
 * - `evening`: the wind-down — how today went, and what tomorrow opens with.
 *
 * `?format=json` returns the underlying snapshot instead of prose, for
 * anything that would rather render the data than hear it.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const latitude = Number(params.get("lat") ?? HOME_LOCATION.latitude);
  const longitude = Number(params.get("lon") ?? HOME_LOCATION.longitude);
  const place = params.get("place") ?? HOME_LOCATION.label;

  const rawMode = params.get("mode");
  const mode: BriefingMode = rawMode === "now" ? "now" : rawMode === "evening" ? "evening" : "morning";

  const snapshot = await gatherSnapshot({
    latitude: Number.isFinite(latitude) ? latitude : HOME_LOCATION.latitude,
    longitude: Number.isFinite(longitude) ? longitude : HOME_LOCATION.longitude,
    place,
    // Only the evening wind-down needs tomorrow's calendar — no reason to
    // pay for that fetch on every morning or now-brief request.
    includeTomorrow: mode === "evening",
  });

  if (params.get("format") === "json") {
    return Response.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  }

  // What the caller was told last time, so a now-brief can skip what hasn't
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
