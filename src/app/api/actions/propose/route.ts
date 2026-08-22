import { gatherSnapshot } from "@/lib/briefing/snapshot";
import { deterministicProposal, validProposal } from "@/lib/actions";
import { ollamaConfig } from "@/lib/ollama";
import { seal } from "@/lib/seal";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question.trim().slice(0, 2_000) : "";
  if (!question) return Response.json({ proposal: null });
  const deterministic = deterministicProposal(question);
  if (deterministic) {
    return Response.json({
      proposal: deterministic,
      confirmation: seal({ proposal: deterministic, expiresAt: Date.now() + 10 * 60_000 }),
    });
  }

  // Everything here happens before Miles answers an ordinary question, so the
  // whole route is budgeted to stay under the browser's classification timeout
  // rather than to give a slow provider or a slow model its full patience.
  const snapshot = await Promise.race([
    // The race covers a slow snapshot; the catch covers a broken one. Without
    // it, a provider that throws rather than hangs takes the whole route down
    // — and classification is meant to be an enhancement, never a gate.
    gatherSnapshot().catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 5_000)),
  ]);
  const { baseUrl, model } = ollamaConfig();
  const now = typeof body?.localTime === "string" ? body.localTime.slice(0, 200) : new Date().toString();
  const context = snapshot ? {
    schedule: snapshot.schedule.events.slice(0, 20),
    tasks: snapshot.tasks.items.slice(0, 30),
    inbox: snapshot.inbox.messages.slice(0, 20),
  } : null;

  const prompt = `Decide whether this is a request to perform exactly one supported action.
Supported kinds: calendar.create, task.create, task.complete, email.dismiss, watchlist.add, watchlist.remove, memory.remember, memory.forget.
Return JSON only. If it is not a supported action or required details are ambiguous, return {"proposal":null}.
Otherwise return {"proposal":{"summary":"plain confirmation sentence","action":{...}}}.
calendar.create requires title, ISO start, ISO end, optional location. Default duration is 30 minutes only when a start is clear.
task.create requires title and optional ISO due. task.complete requires an exact taskId and title from context.
email.dismiss requires an exact messageId and title from context. Watchlist actions require an uppercase symbol.
Never invent an id. Current local time: ${now}.
Context: ${JSON.stringify(context)}
User: ${question}`;

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        options: { temperature: 0 },
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(9_000)]),
    });
    if (!response.ok) return Response.json({ proposal: null });
    const result = await response.json();
    const parsed = JSON.parse(result?.message?.content ?? "{}");
    const proposal = validProposal(parsed?.proposal ?? parsed);
    return Response.json({
      proposal,
      confirmation: proposal ? seal({ proposal, expiresAt: Date.now() + 10 * 60_000 }) : null,
    });
  } catch (error) {
    console.error("[actions:propose]", error);
    return Response.json({ proposal: null });
  }
}

