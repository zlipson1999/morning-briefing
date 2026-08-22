import { getTodaysCalendar, type TodaysCalendar } from "@/lib/calendar";
import { describeError, fail, ok } from "@/lib/panel";

export const dynamic = "force-dynamic";

/** Today's schedule, from the Zapier-fed store or the sample day. */
export async function GET() {
  try {
    return ok<TodaysCalendar>({ data: await getTodaysCalendar() });
  } catch (error) {
    console.error("[calendar]", error);
    return fail(describeError(error, "The calendar store"));
  }
}
