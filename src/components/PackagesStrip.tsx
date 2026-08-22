"use client";

import { usePanelData } from "@/hooks/usePanelData";
import type { Package } from "@/lib/packages";

/**
 * A quiet line for what's arriving today — visible only when something is.
 *
 * Same shape as LeaveBy: silent by default, so a day with nothing in transit
 * costs the layout nothing. Everything here comes from Gmail already being
 * read for the inbox panel; this is a second question asked of the same
 * connection, not a new integration.
 */
export default function PackagesStrip() {
  const state = usePanelData<{ packages: Package[] }>("/api/packages", { refreshMs: 15 * 60_000 });

  if (state.status !== "ready") return null;

  const packages = state.data.packages;
  const today = packages.filter((p) => p.arrivingToday);
  if (today.length === 0) return null;

  const accent = "#f0a63c";
  const inTransit = packages.length - today.length;

  return (
    <section
      className="rise flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border px-4 py-3"
      style={{
        borderColor: `color-mix(in oklab, ${accent} 30%, transparent)`,
        background: `color-mix(in oklab, ${accent} 8%, transparent)`,
      }}
      aria-live="polite"
    >
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-xl"
        style={{ color: accent, background: `color-mix(in oklab, ${accent} 16%, transparent)` }}
      >
        <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
          <path d="M3 8l9 5 9-5M12 13v8" />
        </svg>
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-mist-100">
          {today.length === 1
            ? `${today[0].carrier} arriving today`
            : `${today.length} packages arriving today`}
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-mist-300">
          {today.map((p) => p.subject).join(" · ")}
        </span>
      </span>

      {inTransit > 0 && (
        <span className="shrink-0 text-[11px] text-mist-400 tabular-nums">
          +{inTransit} still in transit
        </span>
      )}
    </section>
  );
}
