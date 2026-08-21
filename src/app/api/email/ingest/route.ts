import { normalizeMailPayload, removeMessage, upsertMessages } from "@/lib/mail";
import { authorised, refuse } from "@/lib/push/auth";

export const dynamic = "force-dynamic";

/**
 * Where Zapier pushes mail worth knowing about.
 *
 * Point a Gmail trigger with a search at this — `is:important is:unread`, or
 * a list of the people you actually answer. Pushing everything would turn the
 * panel into a second inbox, which is the thing a briefing exists to save you
 * from.
 *
 * This is a read-only view by design: a push is one-directional, so nothing
 * here can mark a message read in Gmail. The panel says "handled" instead,
 * which is a claim it can actually keep.
 */
export async function POST(request: Request) {
  if (!authorised(request)) return refuse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const messages = normalizeMailPayload(body);
  if (messages.length === 0) {
    return Response.json(
      { error: "No usable messages. Each one needs at least a subject or a sender." },
      { status: 422 },
    );
  }

  const stored = await upsertMessages(messages);
  return Response.json({
    accepted: messages.length,
    stored,
    messages: messages.map((message) => ({
      id: message.id,
      sender: message.sender,
      subject: message.subject,
      received: message.receivedIso,
      important: message.important,
    })),
  });
}

export async function DELETE(request: Request) {
  if (!authorised(request)) return refuse();

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Pass ?id=<message id>." }, { status: 400 });

  return Response.json({ removed: await removeMessage(id) });
}
