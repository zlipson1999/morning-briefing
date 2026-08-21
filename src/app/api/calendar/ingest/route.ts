import { normalizePayload, removeEvent, upsertEvents } from "@/lib/calendar";
import { authorised, refuse } from "@/lib/push/auth";

export const dynamic = "force-dynamic";

/**
 * Where Zapier pushes Google Calendar.
 *
 * In Zapier: Google Calendar trigger → Webhooks by Zapier → POST to
 * `http://<machine>.<tailnet>.ts.net:3000/api/calendar/ingest`, with a header
 * `Authorization: Bearer <CALENDAR_INGEST_TOKEN>` and the event as the
 * payload. Nested, `__`-flattened and renamed field shapes all parse.
 */
export async function POST(request: Request) {
  if (!authorised(request)) return refuse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const events = normalizePayload(body);
  if (events.length === 0) {
    return Response.json(
      { error: "No usable events. Each one needs at least a title and a start time." },
      { status: 422 },
    );
  }

  const stored = await upsertEvents(events);
  return Response.json({
    accepted: events.length,
    stored,
    // Echoed back so a Zap's test run shows what was actually understood —
    // including whether a location became a drivable address.
    events: events.map((event) => ({
      id: event.id,
      title: event.title,
      start: event.startIso,
      kind: event.kind,
      address: event.address ?? null,
    })),
  });
}

/** For a Zap that fires on deletion, or a manual cleanup. */
export async function DELETE(request: Request) {
  if (!authorised(request)) return refuse();

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Pass ?id=<event id>." }, { status: 400 });

  return Response.json({ removed: await removeEvent(id) });
}
