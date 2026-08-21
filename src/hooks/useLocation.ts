"use client";

import { useEffect, useState } from "react";
import { HOME_LOCATION } from "@/lib/config";

export type Coords = { latitude: number; longitude: number; label: string; exact: boolean };

/**
 * Resolves where "near me" means. Starts from the configured home location so
 * panels render immediately, then upgrades to real coordinates if the browser
 * grants permission. Denial is not an error — it just keeps the fallback.
 */
export function useLocation(): Coords {
  const [coords, setCoords] = useState<Coords>({ ...HOME_LOCATION, exact: false });

  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    let cancelled = false;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        setCoords({
          latitude: Number(pos.coords.latitude.toFixed(3)),
          longitude: Number(pos.coords.longitude.toFixed(3)),
          label: HOME_LOCATION.label,
          exact: true,
        });
      },
      () => {
        /* Denied or unavailable — the configured home location stands. */
      },
      { timeout: 8000, maximumAge: 10 * 60_000 },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  return coords;
}
