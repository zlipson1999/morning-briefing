import type { BriefingSnapshot } from "./snapshot";

type Inbox = BriefingSnapshot["inbox"];
type Message = Inbox["messages"][number];

function senderName(sender: string): string {
  const clean = sender.replace(/<[^>]+>/g, "").trim();
  return clean.split(/\s+/)[0] || "Someone";
}

function firstUsefulSentence(preview: string): string {
  const sentences = preview
    .replace(/^(hi|hello|hey)\s+[^,]{1,30},?\s*/i, "")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.replace(/[.!?]+$/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return (
    sentences.find(
      (sentence) =>
        sentence.length >= 12 &&
        !/^(thanks|thank you|hope you(?:'re| are)|just following up)\b/i.test(sentence),
    ) ??
    sentences[0] ??
    ""
  );
}

/** Turn noisy mailbox metadata into a useful phrase for spoken audio. */
export function spokenEmailTopic(message: Message): string {
  const rawSubject = message.subject.trim();
  const machineLike =
    /^(?:(?:re|fw|fwd)\s*:\s*)+/i.test(rawSubject) ||
    /\[[^\]]+\]|\b(?:ticket|case|issue)\s*#?\s*[a-z0-9-]+\b|[_|]/i.test(rawSubject);
  const preview = firstUsefulSentence(message.preview);
  const subject = rawSubject
    .replace(/^\s*(?:(?:re|fw|fwd)\s*:\s*)+/i, "")
    .replace(/\[[^\]]{1,40}\]/g, " ")
    .replace(/\b(?:ticket|case|issue)\s*#?\s*[a-z0-9-]+\b/gi, " ")
    .replace(/^[-–—:#\s]+|[-–—:#\s]+$/g, "")
    .replace(/[_|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const topic = (machineLike && preview ? preview : subject || preview) || "a message that may need a reply";
  const shortened =
    topic.length > 100 ? `${topic.slice(0, 97).replace(/\s+\S*$/, "")}…` : topic;
  return /^[A-Z]{2,}(?:\s|$)/.test(shortened)
    ? shortened
    : shortened.charAt(0).toLowerCase() + shortened.slice(1);
}

function joinDetails(details: string[]): string {
  if (details.length < 2) return details[0] ?? "";
  if (details.length === 2) return `${details[0]} and ${details[1]}`;
  return `${details.slice(0, -1).join("; ")}; and ${details.at(-1)}`;
}

function detail(message: Message): string {
  return `${senderName(message.sender)} about ${spokenEmailTopic(message)}`;
}

export function inboxDigest(inbox: Inbox): string {
  if (inbox.unread === 0) return "Your inbox is clear.";

  const selected = [...inbox.messages].sort((a, b) => Number(b.important) - Number(a.important)).slice(0, 3);
  const count = `You have ${inbox.unread} unread ${inbox.unread === 1 ? "email" : "emails"}.`;
  if (!selected.length) return count;

  const label = selected.length === 1 ? "The one worth a quick look is" : `The ${selected.length} worth a quick look are`;
  return `${count} ${label} from ${joinDetails(selected.map(detail))}.`;
}

export function recentEmailDigest(messages: Message[]): string {
  const selected = messages.slice(0, 3);
  if (selected.length === 1) {
    return `${senderName(selected[0].sender)} sent an important update about ${spokenEmailTopic(selected[0])}.`;
  }
  return `${messages.length} important emails arrived. The main ones are from ${joinDetails(selected.map(detail))}.`;
}

