import { composeWeek, gatherWeek, type WeekDay } from "@/lib/briefing/week";

export const dynamic = "force-dynamic";

/**
 * "Hey Miles, week ahead" over HTTP. Deterministic, no key required — this
 * is structured data (day names and counts), not a judgement call.
 *
 *   curl -s localhost:3000/api/week
 *   curl -s "localhost:3000/api/week?format=json"
 */
export async function GET(request: Request) {
  const days = await gatherWeek(new Date());

  if (new URL(request.url).searchParams.get("format") === "json") {
    return Response.json({ days } satisfies { days: WeekDay[] }, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  return new Response(composeWeek(days), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
