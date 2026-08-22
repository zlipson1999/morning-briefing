import { cached } from "@/lib/cache";
import { receivedLabelFor, type MailMessage } from "@/lib/mail";
import { splitSender } from "@/lib/mail/normalize";
import type { PackageMail } from "@/lib/packages";
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

/** Runs a Gmail search and fetches metadata for every match — the two-step
 *  dance the API requires, shared by the inbox search and the package one. */
async function searchMessages(query: string, maxResults: number): Promise<ApiMessage[] | null> {
  const list = await googleGet(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages" +
      `?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,
  );
  if (!list) return null;

  const ids = ((list.messages as { id: string }[]) ?? []).map((m) => m.id);
  const messages = await Promise.all(
    ids.map((id) =>
      googleGet(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}` +
          "?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date",
      ),
    ),
  );
  return messages.filter((m): m is ApiMessage => m !== null) as ApiMessage[];
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
    const messages = await searchMessages(gmailSearch(), 12);
    if (!messages) throw new Error("Gmail: not connected");

    return messages
      .map((message) => mapGmailMessage(message, now))
      .filter((message): message is MailMessage => message !== null)
      .sort((a, b) => (b.receivedAt ?? 0) - (a.receivedAt ?? 0));
  });
  return value;
}

/**
 * Shipping mail, for the package radar. A separate search from the inbox
 * one: shipping confirmations are rarely flagged important or left unread,
 * so reusing GMAIL_SEARCH would miss almost all of them.
 */
const DEFAULT_PACKAGES_SEARCH =
  'newer_than:10d (from:amazon.com OR from:ups.com OR from:fedex.com OR from:usps.com OR ' +
  'from:dhl.com OR from:ontrac.com OR subject:(shipped OR "out for delivery" OR delivered OR ' +
  'tracking OR "estimated delivery"))';

export function packagesSearch(): string {
  return process.env.PACKAGES_SEARCH || DEFAULT_PACKAGES_SEARCH;
}

export async function googlePackageMail(): Promise<PackageMail[] | null> {
  if (!(await googleIsConnected())) return null;

  const { value } = await cached(`google:packages:${packagesSearch()}`, { ttlMs: 5 * 60_000 }, async () => {
    const messages = await searchMessages(packagesSearch(), 15);
    if (!messages) throw new Error("Gmail: not connected");

    return messages.map((message) => ({
      sender: header(message, "From"),
      subject: header(message, "Subject"),
      snippet: message.snippet ?? "",
      receivedAt: Number(message.internalDate) || null,
    }));
  });
  return value;
}
