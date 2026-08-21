import { describeError, fail, ok } from "@/lib/panel";
import { getNews, type NewsBundle } from "@/lib/providers/news";
import { HOME_LOCATION } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const place = new URL(request.url).searchParams.get("place") || HOME_LOCATION.label;

  try {
    const { value, stale, degraded } = await getNews(place);
    return ok<NewsBundle>({ data: value, stale, degraded: degraded.length ? degraded : undefined });
  } catch (error) {
    console.error("[news]", error);
    return fail(describeError(error, "The news feeds"));
  }
}
