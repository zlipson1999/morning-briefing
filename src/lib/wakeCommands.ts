import type { SpeakMode } from "@/hooks/useBriefingVoice";

/**
 * What "Hey Miles, …" means.
 *
 * A handful of intents are recognised outright — stop, mute, the full
 * briefing again, goodnight, the week ahead. Anything else with real content
 * is a question: it goes to Claude grounded in the day's data, because a
 * wake word that only understands five phrases isn't an assistant, it's a
 * remote control. Only a bare "Hey Miles" — nothing after the name — falls
 * through to the short update, since that's what asking for nothing means.
 */

export type WakeIntent =
  | { kind: "speak"; mode: SpeakMode }
  | { kind: "ask"; question: string }
  | { kind: "week" }
  | { kind: "stop" }
  | { kind: "mute" }
  | { kind: "unmute" };

/** Just asking for the standard update, in so many words. */
const UPDATE_ONLY = /^(what'?s (up|new)|update( me)?|status|anything (new|going on))\W*$/;

export function interpretWakeCommand(command: string): WakeIntent {
  const text = command.toLowerCase().trim();

  if (!text) return { kind: "speak", mode: "now" };

  if (/\b(stop|quiet|silence|enough|shut up|never ?mind|cancel)\b/.test(text)) {
    return { kind: "stop" };
  }
  if (/\bunmute\b|\bvoice (?:back )?on\b/.test(text)) {
    return { kind: "unmute" };
  }
  if (/\bmute\b|\bvoice off\b/.test(text)) {
    return { kind: "mute" };
  }
  if (/\b(full|whole|entire|complete|morning|again|everything|start over|from the top)\b/.test(text)) {
    return { kind: "speak", mode: "morning" };
  }
  if (/\b(good ?night|wind ?down|how (was|did) (today|my day)( go)?|end of (the )?day|wrap(ping)? up)\b/.test(text)) {
    return { kind: "speak", mode: "evening" };
  }
  if (/\b(week ahead|(this|my|the) week|coming week|next 7 days)\b/.test(text)) {
    return { kind: "week" };
  }
  if (UPDATE_ONLY.test(text)) {
    return { kind: "speak", mode: "now" };
  }

  // Real content, nothing else matched: it's a question.
  return { kind: "ask", question: command.trim() };
}
