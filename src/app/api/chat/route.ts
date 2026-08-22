import { HOME_LOCATION } from "@/lib/config";
import { gatherSnapshot } from "@/lib/briefing/snapshot";
import {
  MILES_CHAT_SYSTEM,
  normalizeChatMessages,
  ollamaConfig,
} from "@/lib/ollama";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: {
    messages?: unknown;
    location?: { latitude?: unknown; longitude?: unknown; place?: unknown };
    clientTime?: { local?: unknown; hour?: unknown; timeZone?: unknown };
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: { message: "The chat request was not valid JSON." } }, { status: 400 });
  }

  const messages = normalizeChatMessages(body.messages);
  if (messages.length === 0 || messages.at(-1)?.role !== "user") {
    return Response.json({ error: { message: "Ask Miles a question first." } }, { status: 400 });
  }

  const latitude = Number(body.location?.latitude);
  const longitude = Number(body.location?.longitude);
  const place = typeof body.location?.place === "string" ? body.location.place.slice(0, 200) : HOME_LOCATION.label;
  // Chat must remain usable when Google, news, quotes, or another briefing
  // provider is slow. Give the live context a short budget, then let Ollama
  // answer without it rather than trapping the user behind an upstream call.
  const snapshot = await Promise.race([
    gatherSnapshot({
      latitude: Number.isFinite(latitude) ? latitude : HOME_LOCATION.latitude,
      longitude: Number.isFinite(longitude) ? longitude : HOME_LOCATION.longitude,
      place,
    }),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000)),
  ]);
  const { baseUrl, model } = ollamaConfig();
  const clientHour = Number(body.clientTime?.hour);
  const timeContext = Number.isInteger(clientHour) && clientHour >= 0 && clientHour <= 23
    ? `The user's local hour is ${clientHour}. If a greeting is appropriate, use exactly “${greetingForHour(clientHour)}”; do not substitute a different time-of-day greeting. Their time zone is ${String(body.clientTime?.timeZone ?? "unknown").slice(0, 100)}.`
    : "The user's exact local time is unavailable; avoid a time-of-day greeting.";
  const currentContext = snapshot
    ? {
        now: snapshot.now,
        weather: snapshot.weather,
        schedule: { ...snapshot.schedule, events: snapshot.schedule.events.slice(0, 8) },
        inbox: { unread: snapshot.inbox.unread, messages: snapshot.inbox.messages.slice(0, 5) },
        tasks: { ...snapshot.tasks, items: snapshot.tasks.items.slice(0, 10) },
        portfolio: snapshot.portfolio,
        news: {
          local: snapshot.news.local.slice(0, 2),
          florida: snapshot.news.florida.slice(0, 2),
          us: snapshot.news.us.slice(0, 2),
          world: snapshot.news.world.slice(0, 2),
        },
        commute: snapshot.commute,
        tomorrow: snapshot.tomorrow,
      }
    : null;

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [
          {
            role: "system",
            content: currentContext
              ? `${MILES_CHAT_SYSTEM}\n${timeContext}\n\nCurrent snapshot:\n${JSON.stringify(currentContext)}`
              : `${MILES_CHAT_SYSTEM}\n${timeContext}\n\nCurrent snapshot: temporarily unavailable.`,
          },
          ...messages,
        ],
      }),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(120_000)]),
    });
  } catch (error) {
    console.error("[chat:ollama]", error);
    return Response.json(
      { error: { message: `Couldn't reach Ollama at ${baseUrl}. Make sure Ollama is running.` } },
      { status: 502 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    console.error(`[chat:ollama] ${upstream.status}: ${detail.slice(0, 500)}`);
    const missing = upstream.status === 404 ? ` Ollama may not have model “${model}” installed.` : "";
    return Response.json(
      { error: { message: `Ollama returned ${upstream.status}.${missing}` } },
      { status: 502 },
    );
  }

  return new Response(ollamaTextStream(upstream.body), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Miles-Model": model,
    },
  });
}

function greetingForHour(hour: number) {
  // After midnight can still be the user's late evening. Miles should not
  // greet someone winding down at 1 a.m. as though they just woke up.
  if (hour < 5) return "good evening";
  if (hour < 12) return "good morning";
  if (hour < 18) return "good afternoon";
  return "good evening";
}

/** Convert Ollama's newline-delimited JSON stream into plain text chunks. */
function ollamaTextStream(source: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  function emit(line: string, controller: TransformStreamDefaultController<Uint8Array>) {
    if (!line.trim()) return;
    try {
      const chunk = JSON.parse(line);
      const content = chunk?.message?.content;
      if (typeof content === "string" && content) controller.enqueue(encoder.encode(content));
    } catch {
      // A malformed upstream line should not discard the rest of the answer.
    }
  }

  return source.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(value, controller) {
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) emit(line, controller);
    },
    flush(controller) {
      buffer += decoder.decode();
      emit(buffer, controller);
    },
  }));
}

