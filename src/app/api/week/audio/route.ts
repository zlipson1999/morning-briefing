import { composeWeek, gatherWeek } from "@/lib/briefing/week";
import { configuredBackend, speakBriefing } from "@/lib/tts";

export const dynamic = "force-dynamic";

/** The week ahead, spoken — mirrors /api/briefing/audio. */
export async function GET() {
  if (configuredBackend() === "none") {
    return Response.json(
      { error: { message: "No speech backend configured.", retryable: false } },
      { status: 501, headers: { "Cache-Control": "no-store" } },
    );
  }

  const text = composeWeek(await gatherWeek(new Date()));
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
