import { googlePackageMail } from "@/lib/providers/google/gmail";

/**
 * Package radar — "arriving today" surfaced from mail Gmail already sees.
 *
 * No new integration: the same read-only Gmail connection the inbox panel
 * uses is asked one more question, with its own search so shipping mail
 * (rarely flagged important, often already read) isn't missed. Everything
 * here is a heuristic over a subject line and a snippet — carrier and ETA are
 * best-effort, and a package that can't be classified is simply left off
 * rather than guessed at.
 */

export type PackageStatus = "ordered" | "shipped" | "out_for_delivery" | "delivered" | "unknown";

export type Package = {
  id: string;
  carrier: string;
  status: PackageStatus;
  /** "Today", "Tomorrow", "Fri, Aug 22", or "" when no date could be read. */
  etaLabel: string;
  etaAt: number | null;
  subject: string;
  arrivingToday: boolean;
};

/** What a package-tracking Gmail message looks like before classification. */
export type PackageMail = { sender: string; subject: string; snippet: string; receivedAt: number | null };

const CARRIERS: { name: string; re: RegExp }[] = [
  { name: "Amazon", re: /\bamazon\b/i },
  { name: "UPS", re: /\bups\b/i },
  { name: "FedEx", re: /\bfedex\b/i },
  { name: "USPS", re: /\busps\b/i },
  { name: "DHL", re: /\bdhl\b/i },
  { name: "OnTrac", re: /\bontrac\b/i },
];

function carrierFrom(text: string): string {
  return CARRIERS.find((c) => c.re.test(text))?.name ?? "Package";
}

function statusFrom(text: string): PackageStatus {
  if (/\bdelivered\b/i.test(text)) return "delivered";
  if (/\bout for delivery\b/i.test(text)) return "out_for_delivery";
  if (/\b(shipped|on (its|the) way|tracking (number|info)|has left)\b/i.test(text)) return "shipped";
  if (/\b(order(ed)?|confirmation|purchase)\b/i.test(text)) return "ordered";
  return "unknown";
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Best-effort ETA out of a subject/snippet: "today"/"tomorrow" literally,
 * a weekday name ("arriving Friday"), or a month-and-day ("Aug 22"). The
 * first match wins — these emails rarely carry more than one date worth
 * reading, and picking the first keeps this from over-fitting to any one
 * carrier's exact phrasing.
 */
export function etaFrom(text: string, now: Date): { label: string; at: number | null } {
  if (/\btoday\b/i.test(text)) {
    return { label: "Today", at: startOfDay(now).getTime() };
  }
  if (/\btomorrow\b/i.test(text)) {
    const at = startOfDay(new Date(now.getTime() + 24 * 60 * 60_000));
    return { label: "Tomorrow", at: at.getTime() };
  }

  const weekday = /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i.exec(text);
  if (weekday) {
    const target = WEEKDAYS.indexOf(weekday[1].toLowerCase());
    const date = startOfDay(now);
    // Next occurrence of that weekday, today included.
    date.setDate(date.getDate() + ((target - date.getDay() + 7) % 7));
    return {
      label: date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
      at: date.getTime(),
    };
  }

  const monthDay = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})\b/i.exec(text);
  if (monthDay) {
    const parsed = new Date(`${monthDay[1]} ${monthDay[2]}, ${now.getFullYear()}`);
    if (!Number.isNaN(parsed.getTime())) {
      return {
        label: parsed.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
        at: parsed.getTime(),
      };
    }
  }

  return { label: "", at: null };
}

/** Turns one candidate email into a Package, or null if it isn't shipping mail at all. */
export function classifyPackage(mail: PackageMail, now: Date): Package | null {
  const text = `${mail.subject} ${mail.snippet}`;
  const status = statusFrom(`${mail.sender} ${text}`);
  if (status === "unknown") return null;

  let { label, at } = etaFrom(text, now);

  // "Out for delivery" with no explicit date is today by definition.
  if (status === "out_for_delivery" && !label) {
    label = "Today";
    at = startOfDay(now).getTime();
  }

  return {
    id: `${mail.sender}:${mail.subject}`,
    carrier: carrierFrom(`${mail.sender} ${mail.subject}`),
    status,
    etaLabel: label,
    etaAt: at,
    subject: mail.subject,
    arrivingToday: status !== "delivered" && at !== null && sameDay(new Date(at), now),
  };
}

export function classifyPackages(mails: PackageMail[], now: Date): Package[] {
  return mails
    .map((mail) => classifyPackage(mail, now))
    .filter((p): p is Package => p !== null)
    // Delivered packages are done, not "in transit" — nothing left to radar.
    .filter((p) => p.status !== "delivered")
    .sort((a, b) => (a.etaAt ?? Infinity) - (b.etaAt ?? Infinity));
}

/**
 * Everything currently in transit, from the same read-only Gmail connection
 * as the inbox. Returns an empty list rather than sample data when nothing's
 * connected — a fabricated package would be a strange thing to demo, and
 * "package radar" is a bonus signal, not a promoted panel that needs one.
 */
export async function getPackages(now: Date = new Date()): Promise<Package[]> {
  try {
    const mail = await googlePackageMail();
    if (mail === null) return [];
    return classifyPackages(mail, now);
  } catch (error) {
    console.error("[packages] google:", error);
    return [];
  }
}
