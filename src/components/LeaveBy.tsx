"use client";

import { usePanelData } from "@/hooks/usePanelData";
import { useLocation } from "@/hooks/useLocation";
import { useClock } from "@/lib/useClock";
import type { Commute } from "@/lib/providers/commute";

/**
 * The only number on this screen that tells you to stand up.
 *
 * Everything else describes the day; this says when to walk out the door for
 * the next thing you can't attend from a desk. It gets to be the loudest
 * element on the page when it's close, and disappears entirely when there's
 * nothing to drive to — an all-Zoom day shouldn't render a banner about it.
 */
export default function LeaveBy() {
  const location = useLocation();
  const nowMs = useClock();
  const minutesNow = nowMs === null ? null : new Date(nowMs).getHours() * 60 + new Date(nowMs).getMinutes();

  // The clock is sent bucketed to five minutes so the URL — and therefore the
  // fetch — changes on the same cadence as the poll, instead of once a minute.
  // The countdown itself is recomputed below against the live clock.
  const state = usePanelData<Commute | null>(
    minutesNow === null
      ? null
      : `/api/commute?lat=${location.latitude}&lon=${location.longitude}` +
        `&now=${Math.floor(minutesNow / 5) * 5}`,
    { refreshMs: 5 * 60_000 },
  );

  if (state.status !== "ready" || !state.data || minutesNow === null) return null;

  const commute = state.data;
  // Recompute against the live clock rather than the fetched value: polling
  // every five minutes must not mean a countdown that jumps in five-minute steps.
  const leaveIn =
    toMinutes(commute.startsAt) - commute.driveMinutes - minutesNow;

  // Past the meeting's start there's nothing useful left to say.
  if (toMinutes(commute.startsAt) <= minutesNow) return null;

  const urgency = leaveIn <= 0 ? "now" : leaveIn <= 45 ? "soon" : "later";
  const tone = {
    now: { accent: "#e0709a", label: `Leave now — ${Math.abs(leaveIn)} min late` },
    soon: { accent: "#f0a63c", label: `Leave in ${leaveIn} min` },
    later: { accent: "#43cf9c", label: `Leave at ${commute.leaveAtLabel}` },
  }[urgency];

  return (
    <section
      className="rise flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border px-4 py-3"
      style={{
        borderColor: `color-mix(in oklab, ${tone.accent} 35%, transparent)`,
        background: `color-mix(in oklab, ${tone.accent} 10%, transparent)`,
      }}
      aria-live="polite"
    >
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-xl"
        style={{ color: tone.accent, background: `color-mix(in oklab, ${tone.accent} 18%, transparent)` }}
      >
        <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 17h14M6.5 17V9.5l1.8-3.2A2 2 0 0 1 10 5.2h4a2 2 0 0 1 1.7 1.1L17.5 9.5V17" />
          <circle cx="8" cy="17" r="1.6" />
          <circle cx="16" cy="17" r="1.6" />
        </svg>
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={`block tabular-nums ${urgency === "later" ? "text-base font-semibold" : "text-lg font-bold"}`}
          style={{ color: tone.accent }}
        >
          {tone.label}
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-mist-300">
          {commute.destination} · {commute.address}
        </span>
      </span>

      <span className="shrink-0 text-right text-[11px] text-mist-400 tabular-nums">
        <span className="block">
          {commute.driveMinutes} min · {commute.distanceMiles} mi
        </span>
        {commute.freeFlow && (
          <span
            className="block"
            title="Routed at free-flow speed and padded for the time of day — no live traffic feed."
          >
            estimated, no live traffic
          </span>
        )}
      </span>
    </section>
  );
}

function toMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}
