import type { StoredMessage } from "./types";

/**
 * Turns whatever a Gmail Zap sends into a `StoredMessage`.
 *
 * Zapier's Gmail trigger flattens the sender into `from__name` /
 * `from__email`, but hand-built Zaps send `from` as a plain string, and some
 * send only an address. All three parse; a message with no subject *and* no
 * sender is rejected.
 */

type Payload = Record<string, unknown>;

function field(payload: Payload, ...names: string[]): unknown {
  for (const name of names) {
    if (payload[name] !== undefined && payload[name] !== null) return payload[name];

    const flattened = payload[name.replace(".", "__")];
    if (flattened !== undefined && flattened !== null) return flattened;

    const [head, tail] = name.split(".");
    if (tail) {
      const parent = payload[head];
      if (parent && typeof parent === "object") {
        const value = (parent as Payload)[tail];
        if (value !== undefined && value !== null) return value;
      }
    }
  }
  return undefined;
}

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const truthy = (value: unknown): boolean =>
  value === true || value === 1 || ["true", "yes", "1"].includes(text(value).toLowerCase());

/** `"Priya Raghavan <priya@nimbus.dev>"` is the shape a raw header arrives in. */
export function splitSender(raw: string): { name: string; email: string } {
  const angled = /^(.*?)\s*<([^>]+)>$/.exec(raw.trim());
  if (angled) {
    return { name: angled[1].replace(/^["']|["']$/g, "").trim() || angled[2], email: angled[2] };
  }
  if (raw.includes("@")) {
    // Bare address: "priya@nimbus.dev" reads better as "priya".
    return { name: raw.split("@")[0].replace(/[._]/g, " ").trim() || raw, email: raw.trim() };
  }
  return { name: raw.trim(), email: "" };
}

function labelFrom(value: unknown): string {
  const entries = Array.isArray(value) ? value.map(text) : text(value).split(/[,;]/);
  const meaningful = entries
    .map((entry) => entry.trim())
    .filter((entry) => entry && !/^(unread|inbox|important|starred|category_)/i.test(entry));

  const first = meaningful[0] ?? "";
  return first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : "Inbox";
}

export function normalizeMessage(payload: Payload): StoredMessage | null {
  const subject = text(field(payload, "subject", "title", "email_subject"));

  const rawSender =
    text(field(payload, "from.name", "from_name", "sender_name", "fromName")) ||
    text(field(payload, "from", "sender", "from_email", "sender_email"));
  const explicitEmail = text(field(payload, "from.email", "from_email", "sender_email", "fromEmail"));

  if (!subject && !rawSender) return null;

  const parsed = splitSender(rawSender);
  const received = new Date(
    text(field(payload, "date", "received_at", "receivedAt", "internalDate", "timestamp")),
  );

  const attachmentCount = Number(field(payload, "attachment_count", "attachments_count"));
  const attachments = field(payload, "attachments");

  return {
    id:
      text(field(payload, "id", "message_id", "messageId", "thread_id", "uid")) ||
      `${parsed.email || parsed.name}:${subject}`,
    sender: parsed.name || parsed.email || "Unknown sender",
    senderEmail: explicitEmail || parsed.email,
    subject: subject || "(no subject)",
    preview: text(field(payload, "preview", "snippet", "body_plain", "body", "text")).slice(0, 240),
    receivedIso: Number.isNaN(received.getTime()) ? new Date().toISOString() : received.toISOString(),
    important:
      truthy(field(payload, "important", "is_important", "starred", "is_starred", "flagged")),
    hasAttachment:
      (Number.isFinite(attachmentCount) && attachmentCount > 0) ||
      (Array.isArray(attachments) && attachments.length > 0) ||
      truthy(field(payload, "has_attachment", "hasAttachment")),
    label: labelFrom(field(payload, "label", "labels", "category", "folder")),
    updatedAt: Date.now(),
  };
}

export function normalizeMailPayload(body: unknown): StoredMessage[] {
  const candidates: unknown[] = Array.isArray(body)
    ? body
    : body && typeof body === "object" && Array.isArray((body as Payload).messages)
      ? ((body as Payload).messages as unknown[])
      : body && typeof body === "object"
        ? [body]
        : [];

  return candidates
    .filter((entry): entry is Payload => Boolean(entry) && typeof entry === "object")
    .map(normalizeMessage)
    .filter((message): message is StoredMessage => message !== null);
}
