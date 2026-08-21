"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePanelData } from "@/hooks/usePanelData";
import { useLocation } from "@/hooks/useLocation";
import { REFRESH_MS } from "@/lib/config";
import { describeUv, type HourPoint, type Weather } from "@/lib/providers/weather";

const SKY = "#5cc8de";

/**
 * Weather doesn't need a whole column — the summary is four numbers you read
 * once, so it sits beside the date where it competes with nothing.
 *
 * The rest of the forecast is a click away rather than absent: humidity, wind,
 * UV, sun times and the next twelve hours all come back in the same request,
 * and hiding them was throwing away data we'd already paid for.
 */
export default function WeatherStrip() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const detailId = useId();

  const state = usePanelData<Weather>(
    `/api/weather?lat=${location.latitude}&lon=${location.longitude}&label=${encodeURIComponent(location.label)}`,
    { refreshMs: REFRESH_MS.weather },
  );

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  if (state.status === "loading") {
    return <span className="inline-block h-5 w-40 animate-pulse rounded bg-ink-700/70" />;
  }
  if (state.status === "error") {
    return <span className="text-[13px] text-mist-400">Weather unavailable</span>;
  }

  const w = state.data;

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={detailId}
        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1 text-[13px] transition-colors hover:bg-ink-800/70 focus-visible:ring-2 focus-visible:ring-[#5cc8de] focus-visible:outline-none"
      >
        <span className="font-mono text-lg font-semibold text-mist-100 tabular-nums">
          {w.tempF}°
        </span>
        <span className="text-mist-200">{w.condition}</span>
        <span className="text-mist-400 tabular-nums">
          H {w.highF}° · L {w.lowF}°
        </span>
        {w.precipChance >= 25 && (
          <span
            className="rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
            style={{ color: SKY, background: `color-mix(in oklab, ${SKY} 15%, transparent)` }}
          >
            {w.precipChance}% rain
          </span>
        )}
        <span className="text-mist-400">{w.place}</span>
        <svg
          viewBox="0 0 24 24"
          className={`size-3.5 text-mist-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          id={detailId}
          className="rise absolute right-0 z-40 mt-2 w-[min(92vw,26rem)] rounded-2xl border border-ink-700 bg-ink-850/95 p-4 text-left shadow-[0_24px_60px_-24px_rgba(0,0,0,0.95)] backdrop-blur-md max-sm:right-auto max-sm:left-0"
        >
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <Stat label="Feels like" value={`${w.feelsLikeF}°`} />
            <Stat label="Humidity" value={`${w.humidity}%`} />
            <Stat label="Rain chance" value={`${w.precipChance}%`} />
            <Stat
              label="Wind"
              value={`${w.windMph} mph`}
              detail={`from ${w.windFrom}${w.gustMph > w.windMph ? ` · gusts ${w.gustMph}` : ""}`}
            />
            <Stat
              label="UV index"
              value={w.uvIndexMax.toFixed(1)}
              detail={describeUv(w.uvIndexMax)}
            />
            <Stat label="Rain today" value={`${w.precipTotalIn.toFixed(2)}"`} />
            <Stat label="Sunrise" value={w.sunrise} />
            <Stat label="Sunset" value={w.sunset} />
            <Stat label="Daylight" value={formatDaylight(w.daylightMinutes)} />
          </dl>

          {w.hourly.length > 0 && <HourlyStrip hours={w.hourly} />}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold tracking-[0.12em] text-mist-400 uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium text-mist-100 tabular-nums">
        {value}
        {detail && <span className="ml-1 text-[11px] font-normal text-mist-400">{detail}</span>}
      </dd>
    </div>
  );
}

function formatDaylight(minutes: number): string {
  if (!minutes) return "—";
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/**
 * The next twelve hours as a temperature profile. Bars are scaled to the
 * window's own range rather than an absolute one, so a flat Florida afternoon
 * still shows its shape instead of a straight line.
 */
function HourlyStrip({ hours }: { hours: HourPoint[] }) {
  const temps = hours.map((hour) => hour.tempF);
  const low = Math.min(...temps);
  const high = Math.max(...temps);
  const span = Math.max(1, high - low);

  return (
    <div className="mt-4 border-t border-ink-700 pt-3">
      <p className="text-[10px] font-semibold tracking-[0.12em] text-mist-400 uppercase">
        Next 12 hours
      </p>
      <ul className="scroll-slim mt-2 flex gap-1 overflow-x-auto pb-1">
        {hours.map((hour, index) => (
          <li key={`${hour.label}-${index}`} className="flex min-w-9 flex-1 flex-col items-center gap-1">
            <span className="text-[10px] font-medium text-mist-200 tabular-nums">
              {hour.tempF}°
            </span>
            <span className="flex h-10 w-full items-end justify-center rounded bg-ink-800/70">
              <span
                className="block w-1.5 rounded-full bg-gradient-to-t from-[#5cc8de] to-[#b28df0]"
                style={{ height: `${20 + ((hour.tempF - low) / span) * 80}%` }}
              />
            </span>
            <span className="h-3 text-[9px] font-semibold text-[#5cc8de] tabular-nums">
              {hour.precipChance >= 20 ? `${hour.precipChance}%` : ""}
            </span>
            <span className="text-[9px] whitespace-nowrap text-mist-400">
              {hour.label.replace(" ", "")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
