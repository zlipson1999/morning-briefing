import { HOME_LOCATION } from "@/lib/config";
import { getTodaysEvents } from "@/lib/calendar";
import { describeError, fail, ok } from "@/lib/panel";
import { nextCommute, type Commute } from "@/lib/providers/commute";

export const dynamic = "force-dynamic";

/**
 * When to walk out the door for the next event you can't attend from a desk.
 *
 * Returns `null` data rather than an error when there's nothing to drive to —
 * an all-Zoom day is a normal state, not a failure.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const latitude = Number(params.get("lat") ?? HOME_LOCATION.latitude);
  const longitude = Number(params.get("lon") ?? HOME_LOCATION.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return fail("Those coordinates don't look right.", { retryable: false, status: 400 });
  }

  // The client's clock is the one that matters: the server may be in another
  // timezone entirely, and "leave in 20 minutes" has to mean the viewer's 20.
  const nowMinutes = Number(params.get("now"));
  const fallbackNow = new Date();

  try {
    const commute = await nextCommute(
      await getTodaysEvents(),
      Number.isFinite(nowMinutes)
        ? nowMinutes
        : fallbackNow.getHours() * 60 + fallbackNow.getMinutes(),
      { latitude, longitude },
    );
    return ok<Commute | null>({ data: commute });
  } catch (error) {
    console.error("[commute]", error);
    return fail(describeError(error, "The route service"));
  }
}
