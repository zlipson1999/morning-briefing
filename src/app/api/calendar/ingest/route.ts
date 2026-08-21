import crypto from "node:crypto";
import { normalizePayload, removeEvent, upsertEvents } from "@/lib/calendar";

export const dynamic = "force-dynamic";

/**
 * Where Zapier pushes Google Calendar.
 *
 * This is the one endpoint in the app that *writes*, so it is the one that
 * needs a shared secret. With `CALENDAR_INGEST_TOKEN` unset it refuses
 * everything rather than accepting anonymous writes — a disabled feature is a
 * better default than an open one, even on a tailnet.
 *
 * In Zapier: Webhooks by Zapier → POST, to
 * `http://<machine>.<tailnet>.ts.net:3000/api/calendar/ingest`, with a header
 * `Authorization: Bearer <your token>` and the Google Calendar event as the
 * payload. Nested, `__`-flattened, and renamed field shapes all parse.
 */

function authorised(request: Request): boolean {
  const expected = process.env.CALENDAR_INGEST_TOKEN;
  if (!expected) return false;

  const header = request.headers.get("authorization") ?? "";
  const supplied = header.replace(/^Bearer\s+/i, "") || request.headers.get("x-ingest-token") || "";

  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  // Compare lengths first: timingSafeEqual throws on a mismatch.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function refuse(): Response {
  if (!process.env.CALENDAR_INGEST_TOKEN) {
    return Response.json(
      { error: "Calendar ingest is disabled. Set CALENDAR_INGEST_TOKEN to enable it." },
      { status: 501 },
    );
  }
  return Response.json({ error: "Unauthorized." }, { status: 401 });
}

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
