"use client";

import { useMemo, useState } from "react";
import Panel from "./Panel";
import { ExternalIcon, NewspaperIcon } from "./icons";
import { usePanelData } from "@/hooks/usePanelData";
import { useLocation } from "@/hooks/useLocation";
import { REFRESH_MS } from "@/lib/config";
import type { Headline, NewsBundle } from "@/lib/providers/news";

function age(publishedAt: number | null): string {
  if (!publishedAt) return "";
  const minutes = Math.round((Date.now() - publishedAt) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/** Anything over a day old gets called out rather than quietly blending in. */
function isStale(publishedAt: number | null): boolean {
  return publishedAt !== null && Date.now() - publishedAt > 24 * 60 * 60_000;
}

export default function NewsPanel({ className }: { className?: string }) {
  const location = useLocation();
  const [scope, setScope] = useState<"local" | "global">("local");

  const url = useMemo(
    () => `/api/news?place=${encodeURIComponent(location.label)}`,
    [location.label],
  );
  const state = usePanelData<NewsBundle>(url, { refreshMs: REFRESH_MS.news });

  const bundle = state.status === "ready" ? state.data : null;
  const items: Headline[] = bundle ? bundle[scope] : [];

  return (
    <Panel
      title="Today's news"
      icon={<NewspaperIcon className="size-full" />}
      accent="#5cc8de"
      meta={bundle?.place}
      delay={240}
      className={className}
      loading={state.status === "loading"}
      error={state.status === "error" ? state.message : null}
      onRetry={state.refresh}
      stale={state.status === "ready" && state.stale}
      degraded={state.status === "ready" ? state.degraded : undefined}
    >
      <div className="mb-2 flex gap-1 px-3">
        {(["local", "global"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setScope(option)}
            aria-pressed={scope === option}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase transition-colors focus-visible:ring-2 focus-visible:ring-[#5cc8de] focus-visible:outline-none ${
              scope === option
                ? "bg-[#5cc8de]/15 text-[#5cc8de]"
                : "text-mist-400 hover:text-mist-200"
            }`}
          >
            {option === "local" ? "Near me" : "World"}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-mist-400">
          No {scope === "local" ? "local" : "world"} headlines came back. Check the feed list in
          <code className="mx-1 rounded bg-ink-800 px-1 py-0.5 text-[11px]">src/lib/feeds.ts</code>.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.id}>
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col gap-1 rounded-xl px-3 py-3 transition-colors hover:bg-ink-800/70 focus-visible:ring-2 focus-visible:ring-[#5cc8de] focus-visible:outline-none"
              >
                <span className="flex items-start gap-2">
                  <span className="min-w-0 flex-1 text-sm leading-snug font-medium text-mist-100">
                    {item.title}
                  </span>
                  <ExternalIcon className="mt-0.5 size-3.5 shrink-0 text-mist-400 opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
                {item.summary && (
                  <span className="line-clamp-2 text-[12px] leading-relaxed text-mist-400">
                    {item.summary}
                  </span>
                )}
                <span className="flex items-center gap-2 text-[11px] text-mist-400">
                  <span className="font-medium text-mist-300">{item.source}</span>
                  {item.publishedAt && (
                    <>
                      <span className="text-mist-400/60" aria-hidden>·</span>
                      <span className={isStale(item.publishedAt) ? "text-mail" : ""}>
                        {age(item.publishedAt)}
                      </span>
                    </>
                  )}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
