import { portfolioLine } from "./template";
import type { BriefingSnapshot } from "./snapshot";

/**
 * The evening wind-down — how today went, and what tomorrow opens with.
 *
 * A sibling to the morning briefing rather than another now-brief: it looks
 * backward over the day instead of forward from this instant, and it plays
 * once, the same way the morning does. Triggered by "Hey Miles, goodnight"
 * or the first open past 8pm.
 */
export function composeEvening(snapshot: BriefingSnapshot): string {
  const { userName, tasks, portfolio, tomorrow } = snapshot;
  const lines: string[] = [`Good evening, ${userName}.`];

  const totalTasks = tasks.done + tasks.open;
  if (totalTasks > 0) {
    lines.push(
      tasks.done > 0
        ? `You wrapped up ${tasks.done} of ${totalTasks} ${totalTasks === 1 ? "task" : "tasks"} today.`
        : "Nothing got checked off today — tomorrow's a fresh start.",
    );
  }

  const money = portfolioLine(portfolio);
  if (money) lines.push(money);

  // `null` means the fetch wasn't asked for or failed; a real tomorrow field
  // — even an empty one — is worth a sentence either way.
  if (tomorrow) {
    lines.push(
      tomorrow.firstEvent
        ? `Tomorrow starts with ${tomorrow.firstEvent.title} at ${tomorrow.firstEvent.start}` +
          (tomorrow.firstEvent.location ? `, ${tomorrow.firstEvent.location}.` : ".")
        : "Nothing on the calendar first thing tomorrow.",
    );
  }

  return lines.join("\n\n");
}
