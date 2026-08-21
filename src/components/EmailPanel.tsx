"use client";

import Panel from "./Panel";
import SourceNotice from "./SourceNotice";
import { MailIcon, PaperclipIcon, StarIcon } from "./icons";
import { usePanelData } from "@/hooks/usePanelData";
import { useDailySet } from "@/hooks/useDailySet";
import type { Inbox, MailMessage } from "@/lib/mail";

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

/**
 * What's waiting on you, and what you've already dealt with.
 *
 * Deliberately *not* "mark as read": a Zapier push is one-directional, so
 * nothing here can change anything in Gmail. Clearing an item means "handled,
 * stop showing me this today", which is a claim this panel can actually keep.
 */
export default function EmailPanel({ className }: { className?: string }) {
  const state = usePanelData<Inbox>("/api/email", { refreshMs: 2 * 60_000 });
  const inbox = state.status === "ready" ? state.data : null;
  const messages: MailMessage[] = inbox?.messages ?? [];

  const handled = useDailySet("email-handled");
  const waiting = messages.filter((message) => !handled.has(message.id));

  return (
    <Panel
      title="Waiting on you"
      icon={<MailIcon className="size-full" />}
      accent="#f0a63c"
      meta={
        messages.length === 0
          ? undefined
          : waiting.length === 0
            ? "All handled"
            : `${waiting.length} waiting`
      }
      delay={180}
      className={className}
      loading={state.status === "loading"}
      error={state.status === "error" ? state.message : null}
      onRetry={state.refresh}
      stale={state.status === "ready" && state.stale}
    >
      {inbox && (
        <SourceNotice
          source={inbox.source}
          syncedAt={inbox.syncedAt}
          accent="#f0a63c"
          noun="inbox"
          endpoint="/api/email/ingest"
          canConnectGoogle={inbox.canConnectGoogle}
        />
      )}

      {messages.length === 0 ? (
        <p className="px-4 py-6 text-sm text-mist-400">Nothing waiting on you.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {messages.map((e) => {
            const isHandled = handled.has(e.id);
            const tint = tintFor(e.sender);

            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => handled.toggle(e.id)}
                  aria-pressed={isHandled}
                  aria-label={`${isHandled ? "Restore" : "Clear"} "${e.subject}" ${
                    isHandled ? "to" : "from"
                  } today's list`}
                  title={
                    isHandled
                      ? "Bring this back into today's list."
                      : "Clear this from today's list. It stays unread in your mail."
                  }
                  className={`flex w-full gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-ink-800/70 focus-visible:ring-2 focus-visible:ring-mail/60 focus-visible:outline-none ${
                    isHandled ? "opacity-45" : ""
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
                    {!isHandled && (
                      <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-mail ring-2 ring-ink-850" />
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span
                        className={`min-w-0 flex-1 truncate text-sm ${
                          isHandled ? "font-medium text-mist-300" : "font-semibold text-mist-100"
                        }`}
                      >
                        {e.sender}
                      </span>
                      {e.important && <StarIcon className="size-3.5 shrink-0 text-mail" />}
                      {e.hasAttachment && (
                        <PaperclipIcon className="size-3.5 shrink-0 text-mist-400" />
                      )}
                      <span className="shrink-0 text-[11px] whitespace-nowrap text-mist-400 tabular-nums">
                        {e.receivedLabel}
                      </span>
                    </span>

                    <span
                      className={`mt-0.5 block truncate text-[13px] ${
                        isHandled ? "text-mist-400" : "text-mist-200"
                      }`}
                    >
                      {e.subject}
                    </span>

                    {e.preview && (
                      <span className="mt-1 line-clamp-2 block text-[12px] leading-relaxed text-mist-400">
                        {e.preview}
                      </span>
                    )}

                    <span className="mt-1.5 inline-block rounded border border-ink-600 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-mist-400 uppercase">
                      {e.label}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
