import { cached } from "@/lib/cache";
import { receivedLabelFor, type MailMessage } from "@/lib/mail";
import { splitSender } from "@/lib/mail/normalize";
import { googleGet, googleIsConnected } from "./auth";

/**
 * What's waiting on you, straight from the Gmail API.
 *
 * The search does the filtering Gmail-side, so Miles never even lists the
 * noise. Default is flagged-and-unread from the last two days; override with
 * GMAIL_SEARCH — `from:` lists of the people you actually answer work well.
 */

const DEFAULT_SEARCH = "is:important is:unread newer_than:2d";

export function gmailSearch(): string {
  return process.env.GMAIL_SEARCH || DEFAULT_SEARCH;
}

type Header = { name?: string; value?: string };
type ApiMessage = {
  id?: string;
  snippet?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: { headers?: Header[] };
};

function header(message: ApiMessage, name: string): string {
  return (
    message.payload?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ""
  );
}

export function mapGmailMessage(message: ApiMessage, now: Date): MailMessage | null {
  const subject = header(message, "Subject");
  const from = header(message, "From");
  if (!subject && !from) return null;

  const sender = splitSender(from);
  const receivedAt = Number(message.internalDate) || null;
  const labels = message.labelIds ?? [];

  // Gmail's structural labels are plumbing; keep the first human one.
  const label = labels.find((l) => !/^(UNREAD|INBOX|IMPORTANT|STARRED|SENT|DRAFT|CATEGORY_|Label_)/.test(l));

  return {
    id: message.id ?? `${sender.email}:${subject}`,
    sender: sender.name || sender.email || "Unknown sender",
    senderEmail: sender.email,
    subject: subject || "(no subject)",
    preview: (message.snippet ?? "").slice(0, 240),
    receivedLabel: receivedAt ? receivedLabelFor(new Date(receivedAt).toISOString(), now) : "",
    receivedAt,
    important: labels.includes("IMPORTANT") || labels.includes("STARRED"),
    hasAttachment: false, // metadata format doesn't say; false beats a lie
    label: label ? label.charAt(0) + label.slice(1).toLowerCase() : "Inbox",
  };
}

export async function googleInbox(now: Date): Promise<MailMessage[] | null> {
  if (!(await googleIsConnected())) return null;

  const { value } = await cached(`google:gmail:${gmailSearch()}`, { ttlMs: 2 * 60_000 }, async () => {
    const list = await googleGet(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages" +
        `?q=${encodeURIComponent(gmailSearch())}&maxResults=12`,
    );
    if (!list) throw new Error("Gmail: not connected");

    const ids = ((list.messages as { id: string }[]) ?? []).map((m) => m.id);

    const messages = await Promise.all(
      ids.map((id) =>
        googleGet(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}` +
            "?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date",
        ),
      ),
    );

    return messages
      .map((message) => (message ? mapGmailMessage(message as ApiMessage, now) : null))
      .filter((message): message is MailMessage => message !== null)
      .sort((a, b) => (b.receivedAt ?? 0) - (a.receivedAt ?? 0));
  });
  return value;
}
