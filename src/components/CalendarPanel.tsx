"use client";

import Panel from "./Panel";
import { CalendarIcon, PinIcon, UsersIcon } from "./icons";
import { events, type CalendarEvent } from "@/lib/data";
import { useClock } from "@/lib/useClock";

const KIND_COLOR: Record<CalendarEvent["kind"], string> = {
  meeting: "#7c8cff",
  focus: "#43cf9c",
  personal: "#f0a63c",
  interview: "#e0709a",
};

const KIND_LABEL: Record<CalendarEvent["kind"], string> = {
  meeting: "Meeting",
  focus: "Focus",
  personal: "Personal",
  interview: "Interview",
};

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function display(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

function duration(e: CalendarEvent) {
  const mins = toMinutes(e.end) - toMinutes(e.start);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export default function CalendarPanel() {
  const nowMs = useClock();
  const minutesNow =
    nowMs === null
      ? null
      : new Date(nowMs).getHours() * 60 + new Date(nowMs).getMinutes();

  const remaining =
    minutesNow === null
      ? events.length
      : events.filter((e) => toMinutes(e.end) > minutesNow).length;

  const nextUp =
    minutesNow === null
      ? null
      : events.find((e) => toMinutes(e.start) > minutesNow) ?? null;

  return (
    <Panel
      title="Today's schedule"
      icon={<CalendarIcon className="size-full" />}
      accent="#7c8cff"
      meta={`${remaining} left of ${events.length}`}
      delay={60}
    >
      <ul className="flex flex-col gap-1">
        {events.map((e) => {
          const accent = KIND_COLOR[e.kind];
          const past = minutesNow !== null && toMinutes(e.end) <= minutesNow;
          const live =
            minutesNow !== null &&
            toMinutes(e.start) <= minutesNow &&
            toMinutes(e.end) > minutesNow;
          const isNext = nextUp?.id === e.id;

          return (
            <li key={e.id}>
              <article
                className={`group relative flex gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-ink-800/70 ${
                  past ? "opacity-45" : ""
                } ${live ? "bg-ink-800/80" : ""}`}
              >
                <div className="w-16 shrink-0 pt-0.5 text-right">
                  <p className="text-[13px] font-semibold text-mist-200 tabular-nums">
                    {display(e.start)}
                  </p>
                  <p className="text-[11px] text-mist-400 tabular-nums">{duration(e)}</p>
                </div>

                <span
                  className="mt-0.5 w-[3px] shrink-0 rounded-full"
                  style={{ background: accent, opacity: past ? 0.5 : 1 }}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <h3
                      className={`min-w-0 flex-1 text-sm font-medium text-mist-100 ${
                        past ? "line-through decoration-mist-400/60" : ""
                      }`}
                    >
                      {e.title}
                    </h3>
                    {live && (
                      <span className="shrink-0 rounded-full bg-[#e0709a]/18 px-2 py-0.5 text-[10px] font-bold tracking-[0.1em] text-[#e0709a] uppercase">
                        Now
                      </span>
                    )}
                    {isNext && (
                      <span className="shrink-0 rounded-full bg-cal/15 px-2 py-0.5 text-[10px] font-bold tracking-[0.1em] text-cal uppercase">
                        Next
                      </span>
                    )}
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-mist-400">
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
                      style={{
                        color: accent,
                        background: `color-mix(in oklab, ${accent} 14%, transparent)`,
                      }}
                    >
                      {KIND_LABEL[e.kind]}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <PinIcon className="size-3.5" />
                      {e.location}
                    </span>
                    {e.attendees.length > 0 && (
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <UsersIcon className="size-3.5 shrink-0" />
                        <span className="truncate">{e.attendees.join(", ")}</span>
                      </span>
                    )}
                  </div>
                </div>
              </article>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
