import { USER_NAME, HOME_LOCATION } from "@/lib/config";
import { events, emails, initialTasks } from "@/lib/data";
import { getNews } from "@/lib/providers/news";
import { describeUv, getWeather } from "@/lib/providers/weather";
import { readPortfolio } from "@/lib/providers/etrade";

export const dynamic = "force-dynamic";

/**
 * The whole briefing as one block of plain prose, meant to be spoken.
 *
 * This lives here rather than in any particular assistant so that anything —
 * a Piper TTS script, a cron job, a phone shortcut — can consume it over HTTP
 * without this app depending on that assistant, or vice versa.
 *
 *   curl -s localhost:3000/api/briefing | piper --model en_US-lessac-medium
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const latitude = Number(url.searchParams.get("lat") ?? HOME_LOCATION.latitude);
  const longitude = Number(url.searchParams.get("lon") ?? HOME_LOCATION.longitude);
  const place = url.searchParams.get("place") ?? HOME_LOCATION.label;

  const lines: string[] = [];
  const now = new Date();
  const hour = now.getHours();

  lines.push(
    `${hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}, ${USER_NAME}. ` +
      `It's ${now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}.`,
  );

  // Every section is optional: one dead upstream shouldn't cost you the brief.
  try {
    const { value: w } = await getWeather(latitude, longitude, place);

    // Everything the forecast knows, in the order you'd actually want it:
    // what it's like now, what it becomes, and what to do about it.
    const parts = [
      `In ${w.place} it's ${w.tempF} degrees and ${w.condition.toLowerCase()}` +
        (Math.abs(w.feelsLikeF - w.tempF) >= 3 ? `, feeling like ${w.feelsLikeF}` : "") +
        `, with a high of ${w.highF} and a low of ${w.lowF}.`,
      `Humidity ${w.humidity} percent, wind ${w.windMph} miles an hour out of the ${w.windFrom}` +
        (w.gustMph >= w.windMph + 8 ? `, gusting to ${w.gustMph}` : "") +
        ".",
    ];

    if (w.precipChance >= 25) {
      parts.push(`There's a ${w.precipChance} percent chance of rain today.`);
    }
    if (w.uvIndexMax >= 6) {
      parts.push(`UV index peaks at ${Math.round(w.uvIndexMax)} — ${describeUv(w.uvIndexMax).toLowerCase()}.`);
    }
    if (w.sunrise && w.sunset) {
      parts.push(`Sunrise ${w.sunrise}, sunset ${w.sunset}.`);
    }

    lines.push(parts.join(" "));
  } catch {
    /* skip weather */
  }

  const nowMinutes = hour * 60 + now.getMinutes();
  const toMinutes = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };
  const upcoming = events.filter((e) => toMinutes(e.end) > nowMinutes);

  if (upcoming.length === 0) {
    lines.push("Your calendar is clear for the rest of the day.");
  } else {
    const next = upcoming[0];
    const spoken = (hhmm: string) => {
      const [h, m] = hhmm.split(":").map(Number);
      const suffix = h < 12 ? "a.m." : "p.m.";
      const hour12 = h % 12 === 0 ? 12 : h % 12;
      return m === 0 ? `${hour12} ${suffix}` : `${hour12} ${m} ${suffix}`;
    };
    lines.push(
      `You have ${upcoming.length} ${upcoming.length === 1 ? "event" : "events"} left today. ` +
        `Next up is ${next.title} at ${spoken(next.start)}.`,
    );
  }

  const important = emails.filter((e) => e.important);
  lines.push(
    `${emails.length} unread ${emails.length === 1 ? "email" : "emails"}` +
      (important.length
        ? `, including flagged notes from ${important.map((e) => e.sender.split(" ")[0]).join(" and ")}.`
        : "."),
  );

  const open = initialTasks.filter((t) => !t.done);
  const high = open.filter((t) => t.priority === "high");
  if (open.length) {
    lines.push(
      `${open.length} open ${open.length === 1 ? "task" : "tasks"}` +
        (high.length ? `. Top priority: ${high[0].title}.` : "."),
    );
  }

  try {
    const { portfolio, state } = await readPortfolio();
    if (state.connected) {
      const dir = portfolio.dayChange >= 0 ? "up" : "down";
      lines.push(
        `Your portfolio is ${dir} ${Math.abs(portfolio.dayChangePct).toFixed(1)} percent today, ` +
          `at ${Math.round(portfolio.totalValue).toLocaleString()} dollars.`,
      );
    }
  } catch {
    /* skip portfolio */
  }

  try {
    const { value: news } = await getNews(place);
    const top = [...news.global, ...news.local].slice(0, 3);
    if (top.length) {
      lines.push("In the news: " + top.map((h) => h.title).join(". ") + ".");
    }
  } catch {
    /* skip news */
  }

  return new Response(lines.join("\n\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
