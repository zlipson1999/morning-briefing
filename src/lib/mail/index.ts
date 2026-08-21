import { emails } from "@/lib/data";
import { googleInbox } from "@/lib/providers/google/gmail";
import { googleCredentials, googleIsConnected } from "@/lib/providers/google/auth";
import { createPushStore } from "@/lib/push/store";
import type { MailMessage, StoredMessage } from "./types";

export * from "./types";
export { normalizeMessage, normalizeMailPayload, splitSender } from "./normalize";

/** Mail older than this stops being "what's waiting on you this morning". */
const KEEP_MS = 7 * 24 * 60 * 60_000;

const store = createPushStore<StoredMessage>({
  name: "mail",
  envVar: "MAIL_STORE",
  isExpired: (message) => {
    const received = Date.parse(message.receivedIso);
    return !Number.isNaN(received) && received < Date.now() - KEEP_MS;
  },
});

export const upsertMessages = store.upsert;
export const removeMessage = store.remove;
export const clearMail = store.clear;
export const readMailStore = store.read;

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

export function receivedLabelFor(receivedIso: string, now: Date): string {
  const at = new Date(receivedIso);
  if (Number.isNaN(at.getTime())) return "";

  const clock = at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (sameDay(at, now)) return clock;
  if (sameDay(at, new Date(now.getTime() - 24 * 60 * 60_000))) return `Yesterday ${clock}`;
  return at.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * The sample inbox encodes its times as "HH:MM" with the convention that
 * anything after noon arrived last night. That hack is fine for sample data
 * and has no place in the real path, so it lives here and nowhere else.
 */
function sampleMessages(): MailMessage[] {
  return emails.map((email) => {
    const [hours, minutes] = email.receivedAt.split(":").map(Number);
    const clock = `${hours % 12 === 0 ? 12 : hours % 12}:${String(minutes).padStart(2, "0")} ${
      hours < 12 ? "AM" : "PM"
    }`;
    return {
      id: email.id,
      sender: email.sender,
      senderEmail: email.senderEmail,
      subject: email.subject,
      preview: email.preview,
      receivedLabel: hours >= 12 ? `Yesterday ${clock}` : clock,
      receivedAt: null,
      important: email.important,
      hasAttachment: email.hasAttachment,
      label: email.label,
    };
  });
}

export type Inbox = {
  messages: MailMessage[];
  source: "google" | "zapier" | "sample";
  syncedAt: number | null;
  canConnectGoogle?: boolean;
};

export async function getInbox(now: Date = new Date()): Promise<Inbox> {
  try {
    const google = await googleInbox(now);
    if (google !== null) {
      return { messages: google, source: "google", syncedAt: Date.now() };
    }
  } catch (error) {
    console.error("[mail] google:", error);
  }

  const canConnectGoogle = googleCredentials() !== null && !(await googleIsConnected());

  const { items, updatedAt } = await store.read();
  const stored = Object.values(items);

  if (stored.length === 0) {
    return { messages: sampleMessages(), source: "sample", syncedAt: null, canConnectGoogle };
  }

  const messages = stored
    .sort((a, b) => Date.parse(b.receivedIso) - Date.parse(a.receivedIso))
    .map((message) => ({
      id: message.id,
      sender: message.sender,
      senderEmail: message.senderEmail,
      subject: message.subject,
      preview: message.preview,
      receivedLabel: receivedLabelFor(message.receivedIso, now),
      receivedAt: Date.parse(message.receivedIso) || null,
      important: message.important,
      hasAttachment: message.hasAttachment,
      label: message.label,
    }));

  return { messages, source: "zapier", syncedAt: updatedAt || null, canConnectGoogle };
}
