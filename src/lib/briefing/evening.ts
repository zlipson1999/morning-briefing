import { portfolioLine } from "./template";
import type { BriefingSnapshot } from "./snapshot";

/** The evening wind-down: how today went, and what tomorrow opens with. */
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
