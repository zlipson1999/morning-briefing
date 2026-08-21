"use client";

import { usePanelData } from "@/hooks/usePanelData";
import { useLocation } from "@/hooks/useLocation";
import { REFRESH_MS } from "@/lib/config";
import type { Weather } from "@/lib/providers/weather";

/**
 * Weather doesn't need a whole column — it's four numbers you read once. It
 * sits beside the date instead, where it competes with nothing.
 */
export default function WeatherStrip() {
  const location = useLocation();
  const state = usePanelData<Weather>(
    `/api/weather?lat=${location.latitude}&lon=${location.longitude}&label=${encodeURIComponent(location.label)}`,
    { refreshMs: REFRESH_MS.weather },
  );

  if (state.status === "loading") {
    return <span className="inline-block h-5 w-40 animate-pulse rounded bg-ink-700/70" />;
  }
  if (state.status === "error") {
    return <span className="text-[13px] text-mist-400">Weather unavailable</span>;
  }

  const w = state.data;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
      <span className="font-mono text-lg font-semibold text-mist-100 tabular-nums">
        {w.tempF}°
      </span>
      <span className="text-mist-200">{w.condition}</span>
      <span className="text-mist-400 tabular-nums">
        H {w.highF}° · L {w.lowF}°
      </span>
      {w.precipChance >= 25 && (
        <span className="rounded bg-[#5cc8de]/15 px-1.5 py-0.5 text-[11px] font-semibold text-[#5cc8de] tabular-nums">
          {w.precipChance}% rain
        </span>
      )}
      <span className="text-mist-400">{w.place}</span>
    </div>
  );
}
