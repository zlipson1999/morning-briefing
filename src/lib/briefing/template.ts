import { describeUv } from "@/lib/providers/weather";
import type { BriefingSnapshot } from "./snapshot";

/**
 * The deterministic briefing: every section rendered, in a fixed order.
 *
 * This is the floor, not the ceiling. It runs with no API key, no network
 * beyond the data itself, and no cost — and it's what you get if Claude is
 * unreachable, unconfigured, or slow. It lists; it doesn't judge.
 */
export function composeTemplate(snapshot: BriefingSnapshot): string {
  const lines: string[] = [];
  const { userName, now, weather, schedule, inbox, tasks, portfolio, news, commute } = snapshot;

  lines.push(
    `${now.hour < 12 ? "Good morning" : now.hour < 18 ? "Good afternoon" : "Good evening"}, ` +
      `${userName}. It's ${now.weekday}, ${now.date}.`,
  );

  if (weather) {
    const parts = [
      `In ${weather.place} it's ${weather.tempF} degrees and ${weather.condition.toLowerCase()}` +
        (Math.abs(weather.feelsLikeF - weather.tempF) >= 3 ? `, feeling like ${weather.feelsLikeF}` : "") +
        `, with a high of ${weather.highF} and a low of ${weather.lowF}.`,
      `Humidity ${weather.humidity} percent, wind ${weather.windMph} miles an hour out of the ${weather.windFrom}` +
        (weather.gustMph >= weather.windMph + 8 ? `, gusting to ${weather.gustMph}` : "") +
        ".",
    ];
    if (weather.precipChance >= 25) {
      parts.push(`There's a ${weather.precipChance} percent chance of rain today.`);
    }
    if (weather.uvIndexMax >= 6) {
      parts.push(
        `UV index peaks at ${Math.round(weather.uvIndexMax)} — ${describeUv(weather.uvIndexMax).toLowerCase()}.`,
      );
    }
    if (weather.sunrise && weather.sunset) {
      parts.push(`Sunrise ${weather.sunrise}, sunset ${weather.sunset}.`);
    }
    lines.push(parts.join(" "));
  }

  const upcoming = schedule.events.filter((event) => event.status !== "past");
  if (upcoming.length === 0) {
    lines.push("Your calendar is clear for the rest of the day.");
  } else {
    const next = upcoming[0];
    lines.push(
      `You have ${schedule.remaining} ${schedule.remaining === 1 ? "event" : "events"} left today. ` +
        `Next up is ${next.title} at ${next.start}.`,
    );
  }

  if (schedule.conflicts.length > 0) {
    const clash = schedule.conflicts[0];
    lines.push(`Heads up: ${clash.a} overlaps ${clash.b}.`);
  }

  if (commute) {
    lines.push(
      commute.leaveInMinutes >= 0
        ? `Leave in ${commute.leaveInMinutes} minutes for ${commute.destination} — about a ` +
            `${commute.driveMinutes} minute drive, so out the door by ${commute.leaveAtLabel}.`
        : `You're ${Math.abs(commute.leaveInMinutes)} minutes past when you should have left ` +
            `for ${commute.destination}.`,
    );
  }

  const important = inbox.messages.filter((message) => message.important);
  lines.push(
    `${inbox.unread} unread ${inbox.unread === 1 ? "email" : "emails"}` +
      (important.length
        ? `, including flagged notes from ${important.map((m) => m.sender.split(" ")[0]).join(" and ")}.`
        : "."),
  );

  if (tasks.open) {
    const high = tasks.items.filter((task) => task.priority === "high");
    lines.push(
      `${tasks.open} open ${tasks.open === 1 ? "task" : "tasks"}` +
        (high.length ? `. Top priority: ${high[0].title}.` : "."),
    );
  }

  if (portfolio?.connected) {
    lines.push(
      `Your portfolio is ${portfolio.dayChangePct >= 0 ? "up" : "down"} ` +
        `${Math.abs(portfolio.dayChangePct).toFixed(1)} percent today, at ` +
        `${Math.round(portfolio.totalValue).toLocaleString()} dollars.`,
    );
  }

  const headlines = [...news.global, ...news.local].slice(0, 3);
  if (headlines.length) {
    lines.push("In the news: " + headlines.map((item) => item.title).join(". ") + ".");
  }

  return lines.join("\n\n");
}
