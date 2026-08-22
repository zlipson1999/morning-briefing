import { describeUv } from "@/lib/providers/weather";
import { endSentence } from "./prose";
import type { BriefingSnapshot } from "./snapshot";

/**
 * The deterministic briefing: every section rendered, in a fixed order.
 *
 * This is the floor, not the ceiling. It runs with no API key, no network
 * beyond the data itself, and no cost — and it's what you get if Claude is
 * unreachable, unconfigured, or slow. It lists; it doesn't judge.
 *
 * The order is the one you asked for: what's happening locally, then what you
 * owe people, then who's waiting on you, then the shape of the day. The single
 * exception is an imminent leave-by time, which jumps the queue — "you should
 * have left fourteen minutes ago" is not a sixth sentence.
 */

/** Inside this many minutes, leaving is the most important thing you can hear. */
const URGENT_LEAVE_MINUTES = 45;

export function portfolioLine(portfolio: BriefingSnapshot["portfolio"]): string | null {
  if (!portfolio || portfolio.mode === "mock") return null;

  if (portfolio.totalValue > 0) {
    const direction = portfolio.dayChangePct >= 0 ? "up" : "down";
    const label = portfolio.connected ? "Your portfolio" : "Your holdings";
    return (
      `${label} ${direction} ${Math.abs(portfolio.dayChangePct).toFixed(1)} percent today, at ` +
      `${Math.round(portfolio.totalValue).toLocaleString()} dollars.`
    );
  }

  // Only bother with a mover that actually moved.
  const notable = portfolio.movers.filter((mover) => Math.abs(mover.dayChangePct) >= 1);
  if (notable.length === 0) return null;

  return (
    "On your watchlist: " +
    notable
      .map(
        (mover) =>
          `${mover.symbol} ${mover.dayChangePct >= 0 ? "up" : "down"} ` +
          `${Math.abs(mover.dayChangePct).toFixed(1)} percent`,
      )
      .join(", ") +
    "."
  );
}

export function composeTemplate(snapshot: BriefingSnapshot): string {
  const lines: string[] = [];
  const { userName, now, weather, schedule, inbox, tasks, portfolio, news, commute } = snapshot;

  lines.push(
    `${now.hour < 12 ? "Good morning" : now.hour < 18 ? "Good afternoon" : "Good evening"}, ` +
      `${userName}. It's ${now.weekday}, ${now.date}.`,
  );

  const leaveLine = commute
    ? commute.leaveInMinutes >= 0
      ? `Leave in ${commute.leaveInMinutes} minutes for ${commute.destination} — about a ` +
        `${commute.driveMinutes} minute drive, so out the door by ${commute.leaveAtLabel}.`
      : `You're ${Math.abs(commute.leaveInMinutes)} minutes past when you should have left ` +
        `for ${commute.destination}.`
    : null;
  const leaveIsUrgent = commute !== null && commute.leaveInMinutes <= URGENT_LEAVE_MINUTES;

  if (leaveLine && leaveIsUrgent) lines.push(leaveLine);

  // 1. Local news.
  if (news.local.length) {
    const top = news.local.slice(0, 3);
    lines.push(
      `Locally: ` + top.map((item) => `${item.title}, from ${item.source}`).join(". ") + ".",
    );
  }

  if (news.florida.length) {
    lines.push(`Across Florida: ${news.florida[0].title}, from ${news.florida[0].source}.`);
  }

  if (news.us.length) {
    lines.push(`Across the U.S.: ${news.us[0].title}, from ${news.us[0].source}.`);
  }

  if (news.world.length) {
    lines.push(`Around the world: ${news.world[0].title}, from ${news.world[0].source}.`);
  }

  // 2. Tasks.
  if (tasks.open) {
    const overdue = tasks.items.filter((task) => task.overdue);
    const high = tasks.items.filter((task) => task.priority === "high");
    lines.push(
      `${tasks.open} open ${tasks.open === 1 ? "task" : "tasks"}` +
        (overdue.length
          ? `, and ${overdue.length} of them ${overdue.length === 1 ? "is" : "are"} overdue — ` +
            `starting with ${overdue[0].title}.`
          : high.length
            ? `. Top priority: ${high[0].title}.`
            : "."),
    );
  } else {
    lines.push("Your task list is clear.");
  }

  // 3. Inbox.
  const important = inbox.messages.filter((message) => message.important);
  lines.push(
    `${inbox.unread} unread ${inbox.unread === 1 ? "email" : "emails"}` +
      (important.length
        ? `, including flagged notes from ${important.map((m) => m.sender.split(" ")[0]).join(" and ")}.`
        : "."),
  );

  // 4. The shape of the day.
  const upcoming = schedule.events.filter((event) => event.status !== "past");
  if (upcoming.length === 0) {
    lines.push("Your calendar is clear for the rest of the day.");
  } else {
    const next = upcoming[0];
    const window = schedule.freeWindows[0];
    lines.push(
      endSentence(
        `You have ${schedule.remaining} ${schedule.remaining === 1 ? "event" : "events"} left today. ` +
          endSentence(`Next up is ${next.title} at ${next.start}`) +
          (window ? ` Your first real gap is ${window.from} to ${window.to}` : ""),
      ),
    );
  }

  if (schedule.conflicts.length > 0) {
    const clash = schedule.conflicts[0];
    lines.push(`Heads up: ${clash.a} overlaps ${clash.b}.`);
  }

  if (leaveLine && !leaveIsUrgent) lines.push(leaveLine);

  // 5. Weather.
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

  // 6. Money. A real account gets a total; a watchlist gets the movers,
  // since a list of prices you don't hold isn't worth a sentence.
  const money = portfolioLine(portfolio);
  if (money) lines.push(money);

  return lines.join("\n\n");
}
