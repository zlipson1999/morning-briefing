import type { SpeakMode } from "@/hooks/useBriefingVoice";

/**
 * What "Hey Miles, …" means.
 *
 * Deliberately a handful of intents rather than a grammar: the wake word's
 * job is to start the briefing without touching the keyboard, not to be a
 * general assistant. Anything unrecognised falls through to the default —
 * the short update — because answering *something* to "hey Miles" matters
 * more than parsing precisely.
 */

export type WakeIntent =
  | { kind: "speak"; mode: SpeakMode }
  | { kind: "stop" }
  | { kind: "mute" }
  | { kind: "unmute" };

export function interpretWakeCommand(command: string): WakeIntent {
  const text = command.toLowerCase().trim();

  if (/\b(stop|quiet|silence|enough|shut up|never ?mind|cancel)\b/.test(text)) {
    return { kind: "stop" };
  }
  if (/\bunmute\b|\bvoice (?:back )?on\b/.test(text)) {
    return { kind: "unmute" };
  }
  if (/\bmute\b|\bvoice off\b/.test(text)) {
    return { kind: "mute" };
  }
  if (/\b(good ?night|evening|wind ?down|wrap(?: up)? today)\b/.test(text)) {
    return { kind: "speak", mode: "evening" };
  }
  if (/\b(full|whole|entire|complete|morning|again|everything|start over|from the top)\b/.test(text)) {
    return { kind: "speak", mode: "morning" };
  }

  // "hey miles", "what's up", "what now", "update me", anything else.
  return { kind: "speak", mode: "now" };
}
