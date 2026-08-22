import { validProposal } from "@/lib/actions";
import { createGoogleCalendarEvent } from "@/lib/providers/google/calendar";
import { completeGoogleTask, createGoogleTask } from "@/lib/providers/google/tasks";
import { updateWatchlist } from "@/lib/watchlist";
import { unseal } from "@/lib/seal";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const confirmed = typeof body?.confirmation === "string"
    ? unseal<{ proposal: unknown; expiresAt: number }>(body.confirmation)
    : null;
  const proposal = confirmed && confirmed.expiresAt > Date.now() ? validProposal(confirmed.proposal) : null;
  if (!proposal) return Response.json({ error: { message: "The proposed action is invalid." } }, { status: 400 });

  try {
    const action = proposal.action;
    switch (action.kind) {
      case "calendar.create":
        await createGoogleCalendarEvent(action);
        break;
      case "task.create":
        await createGoogleTask(action);
        break;
      case "task.complete":
        await completeGoogleTask(action.taskId);
        break;
      case "watchlist.add":
        await updateWatchlist(action.symbol, "add");
        break;
      case "watchlist.remove":
        await updateWatchlist(action.symbol, "remove");
        break;
      case "email.dismiss":
        // This is intentionally local to Miles. Gmail remains read-only; the
        // confirmed id is returned for the browser's daily handled set.
        return Response.json({ ok: true, clientAction: { kind: action.kind, id: action.messageId } });
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[actions:execute]", error);
    return Response.json(
      { error: { message: error instanceof Error ? error.message : "The action failed." } },
      { status: 502 },
    );
  }
}

