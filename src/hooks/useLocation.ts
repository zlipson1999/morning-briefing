"use client";

import { useEffect, useState } from "react";
import { HOME_LOCATION } from "@/lib/config";

export type Coords = {
  latitude: number;
  longitude: number;
  /** What this place is called — the news panel is keyed by it. */
  label: string;
  /** True once the browser's own coordinates are in use. */
  exact: boolean;
};

/**
 * Resolves where "near me" means. Starts from the configured home location so
 * panels render immediately, then upgrades to real coordinates if the browser
 * grants permission. Denial is not an error — it just keeps the fallback.
 *
 * The label is resolved too, not just the coordinates. Leaving it pinned to
 * the configured city was a quiet bug: the weather followed you and the local
 * news didn't.
 */
export function useLocation(): Coords {
  const [coords, setCoords] = useState<Coords>({ ...HOME_LOCATION, exact: false });

  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    let cancelled = false;

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        if (cancelled) return;
        // Three decimals is ~100m: enough for weather and local news, and a
        // coarse enough cache key that we aren't tracking anyone's driveway.
        const latitude = Number(position.coords.latitude.toFixed(3));
        const longitude = Number(position.coords.longitude.toFixed(3));

        setCoords({ latitude, longitude, label: HOME_LOCATION.label, exact: true });

        try {
          const res = await fetch(`/api/place?lat=${latitude}&lon=${longitude}`);
          if (!res.ok) return;
          const body = await res.json();
          if (cancelled || typeof body?.label !== "string") return;
          setCoords({ latitude, longitude, label: body.label, exact: true });
        } catch {
          /* The configured label stands — the coordinates are still better. */
        }
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
