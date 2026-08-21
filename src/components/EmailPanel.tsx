"use client";

import { useState } from "react";
import Panel from "./Panel";
import { MailIcon, PaperclipIcon, StarIcon } from "./icons";
import { emails, type Email } from "@/lib/data";

const AVATAR_TINTS = ["#7c8cff", "#43cf9c", "#f0a63c", "#e0709a", "#5cc8de", "#b28df0"];

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function tintFor(name: string) {
  const sum = [...name].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_TINTS[sum % AVATAR_TINTS.length];
}

function timeLabel(hhmm: string) {
  // Mock data convention: anything stamped after noon arrived last night.
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  const hour = h % 12 === 0 ? 12 : h % 12;
  const clock = `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
  return h >= 12 ? `Yesterday ${clock}` : clock;
}

export default function EmailPanel() {
  const [readIds, setReadIds] = useState<string[]>([]);
  const unread = emails.filter((e) => !readIds.includes(e.id));

  const toggle = (id: string) =>
    setReadIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  return (
    <Panel
      title="Unread email"
      icon={<MailIcon className="size-full" />}
      accent="#f0a63c"
      meta={unread.length === 0 ? "Inbox zero" : `${unread.length} unread`}
      delay={120}
    >
      <ul className="flex flex-col gap-1">
        {emails.map((e: Email) => {
          const isRead = readIds.includes(e.id);
          const tint = tintFor(e.sender);

          return (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => toggle(e.id)}
                aria-pressed={isRead}
                aria-label={`Mark "${e.subject}" as ${isRead ? "unread" : "read"}`}
                className={`flex w-full gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-ink-800/70 focus-visible:ring-2 focus-visible:ring-mail/60 focus-visible:outline-none ${
                  isRead ? "opacity-45" : ""
                }`}
              >
                <span className="relative shrink-0">
                  <span
                    className="flex size-9 items-center justify-center rounded-full text-[11px] font-bold"
                    style={{
                      color: tint,
                      background: `color-mix(in oklab, ${tint} 16%, transparent)`,
                    }}
                  >
                    {initials(e.sender)}
                  </span>
                  {!isRead && (
                    <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-mail ring-2 ring-ink-850" />
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span
                      className={`min-w-0 flex-1 truncate text-sm ${
                        isRead ? "font-medium text-mist-300" : "font-semibold text-mist-100"
                      }`}
                    >
                      {e.sender}
                    </span>
                    {e.important && <StarIcon className="size-3.5 shrink-0 text-mail" />}
                    {e.hasAttachment && (
                      <PaperclipIcon className="size-3.5 shrink-0 text-mist-400" />
                    )}
                    <span className="shrink-0 text-[11px] whitespace-nowrap text-mist-400 tabular-nums">
                      {timeLabel(e.receivedAt)}
                    </span>
                  </span>

                  <span
                    className={`mt-0.5 block truncate text-[13px] ${
                      isRead ? "text-mist-400" : "text-mist-200"
                    }`}
                  >
                    {e.subject}
                  </span>

                  <span className="mt-1 line-clamp-2 block text-[12px] leading-relaxed text-mist-400">
                    {e.preview}
                  </span>

                  <span className="mt-1.5 inline-block rounded border border-ink-600 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-mist-400 uppercase">
                    {e.label}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
