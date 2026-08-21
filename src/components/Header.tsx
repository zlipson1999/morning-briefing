"use client";

import { SunIcon } from "./icons";
import WeatherStrip from "./WeatherStrip";
import VoiceButton from "./VoiceButton";
import { USER_NAME } from "@/lib/data";
import { ASSISTANT_NAME, ASSISTANT_TAGLINE } from "@/lib/config";
import { useClock } from "@/lib/useClock";

function greetingFor(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function Header() {
  const nowMs = useClock();
  const now = nowMs === null ? null : new Date(nowMs);

  const dateLabel = now
    ? now.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";

  const timeLabel = now
    ? now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : "";

  return (
    <header className="rise flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div>
        <p className="flex items-center gap-2 text-[13px] font-medium tracking-[0.16em] text-mist-400 uppercase">
          <SunIcon className="size-4 text-mail" />
          {ASSISTANT_NAME}
          <span className="hidden text-[10px] tracking-[0.14em] text-mist-400/80 normal-case sm:inline">
            {ASSISTANT_TAGLINE}
          </span>
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-mist-100 sm:text-4xl">
          {greetingFor(now?.getHours() ?? 8)},{" "}
          <span className="bg-gradient-to-r from-cal via-mist-100 to-task bg-clip-text text-transparent">
            {USER_NAME}
          </span>
        </h1>
      </div>

      <div className="text-left sm:text-right">
        <p className="text-base font-medium text-mist-200 sm:text-lg">
          {dateLabel || <span className="inline-block h-5 w-52 rounded bg-ink-700/70" />}
        </p>
        <p className="mt-1 text-sm text-mist-400 tabular-nums">
          {timeLabel ? `Local time ${timeLabel}` : " "}
        </p>
        <div className="mt-2 flex sm:justify-end">
          <WeatherStrip />
        </div>
        <div className="mt-2.5 flex sm:justify-end">
          <VoiceButton />
        </div>
      </div>
    </header>
  );
}
