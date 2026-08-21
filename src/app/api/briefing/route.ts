import { HOME_LOCATION } from "@/lib/config";
import { claudeIsConfigured, composeWithClaude } from "@/lib/briefing/claude";
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

  const written = params.get("author") === "template" ? null : await composeWithClaude(snapshot);
  const text = written ?? composeTemplate(snapshot);

  return new Response(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Briefing-Author": written ? "claude" : claudeIsConfigured() ? "template-fallback" : "template",
    },
  });
}
