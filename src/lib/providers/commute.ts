import { cached, fetchWithTimeout } from "@/lib/cache";
import type { CalendarEvent } from "@/lib/data";

export type Commute = {
  /** The event you have to be at. */
  destination: string;
  address: string;
  startsAt: string;
  /** Door-to-door driving estimate, already padded. */
  driveMinutes: number;
  distanceMiles: number;
  /** Negative once you're already late to leave. */
  leaveInMinutes: number;
  leaveAtLabel: string;
  /**
   * True when the estimate is free-flow — OSRM's public router has no live
   * traffic, so the number is padded rather than measured. Said out loud in
   * the UI: a commute number you can't source is worse than none.
   */
  freeFlow: boolean;
};

export type Origin = { latitude: number; longitude: number };

/** Time to get from the door to moving, and from parked to in the room. */
const DOOR_TO_DOOR_MINUTES = 7;

/**
 * OSRM routes at free-flow speed. Rather than pretend that's the whole
 * story, pad by when you're actually travelling — a Florida rush hour is
 * roughly a third slower than an empty road.
 */
function trafficMultiplier(departureMinutes: number): number {
  const morningRush = departureMinutes >= 7 * 60 && departureMinutes < 9.5 * 60;
  const eveningRush = departureMinutes >= 16 * 60 && departureMinutes < 18.5 * 60;
  return morningRush || eveningRush ? 1.35 : 1.1;
}

function toMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}

function clockLabel(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);
  const suffix = hours < 12 ? "AM" : "PM";
  return `${hours % 12 === 0 ? 12 : hours % 12}:${String(wrapped % 60).padStart(2, "0")} ${suffix}`;
}

/** Nominatim's forward geocoder — same service, same no-key terms, as the reverse one. */
async function geocode(address: string): Promise<Origin | null> {
  try {
    const { value } = await cached(
      `geocode:${address.toLowerCase()}`,
      { ttlMs: 7 * 24 * 60 * 60_000 },
      async () => {
        const res = await fetchWithTimeout(
          "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
            encodeURIComponent(address),
          {
            timeoutMs: 6000,
            headers: { "User-Agent": "morning-briefing/1.0 (personal dashboard)" },
          },
        );
        if (!res.ok) throw new Error(`Nominatim responded ${res.status}`);
        const body = await res.json();
        const first = Array.isArray(body) ? body[0] : null;
        if (!first) throw new Error(`No match for ${address}`);
        return { latitude: Number(first.lat), longitude: Number(first.lon) };
      },
    );
    return value;
  } catch {
    return null;
  }
}

/**
 * Drive time from OSRM's public router. No key, no account, no quota — the
 * tradeoff is no live traffic, which `trafficMultiplier` compensates for and
 * `freeFlow` admits to.
 */
async function driveSeconds(from: Origin, to: Origin): Promise<{ seconds: number; metres: number } | null> {
  try {
    const { value } = await cached(
      `route:${from.latitude},${from.longitude}->${to.latitude},${to.longitude}`,
      { ttlMs: 60 * 60_000 },
      async () => {
        const res = await fetchWithTimeout(
          "https://router.project-osrm.org/route/v1/driving/" +
            `${from.longitude},${from.latitude};${to.longitude},${to.latitude}` +
            "?overview=false&alternatives=false",
          { timeoutMs: 7000 },
        );
        if (!res.ok) throw new Error(`OSRM responded ${res.status}`);
        const body = await res.json();
        const route = body?.routes?.[0];
        if (!route) throw new Error("OSRM returned no route");
        return { seconds: Number(route.duration), metres: Number(route.distance) };
      },
    );
    return value;
  } catch {
    return null;
  }
}

/**
 * The next event you physically have to get to, and when to walk out the door.
 *
 * This is the one number on the dashboard that changes behaviour: everything
 * else tells you what today looks like, this tells you to stand up. Events
 * with no address — a Zoom call, a blocked focus hour — are skipped rather
 * than guessed at.
 */
export async function nextCommute(
  events: CalendarEvent[],
  nowMinutes: number,
  origin: Origin,
): Promise<Commute | null> {
  const upcoming = events
    .filter((event) => event.address && toMinutes(event.start) > nowMinutes)
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

  const event = upcoming[0];
  if (!event?.address) return null;

  const destination = await geocode(event.address);
  if (!destination) return null;

  const route = await driveSeconds(origin, destination);
  if (!route) return null;

  const startsAt = toMinutes(event.start);
  // The multiplier is sampled at the arrival end, which is close enough for a
  // trip measured in minutes and avoids a circular "depends on when you leave".
  const driveMinutes =
    Math.ceil((route.seconds / 60) * trafficMultiplier(startsAt)) + DOOR_TO_DOOR_MINUTES;

  return {
    destination: event.title,
    address: event.address,
    startsAt: event.start,
    driveMinutes,
    distanceMiles: Math.round((route.metres / 1609.34) * 10) / 10,
    leaveInMinutes: startsAt - driveMinutes - nowMinutes,
    leaveAtLabel: clockLabel(startsAt - driveMinutes),
    freeFlow: true,
  };
}
